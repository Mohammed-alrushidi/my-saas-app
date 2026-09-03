import { createAdminClient } from "@/lib/supabase/admin"
import { getMuscatBusinessDayBounds, type MuscatBusinessDayBounds } from "@/lib/dates/muscat-day"
import { isBirthdayToday } from "@/lib/dates/birthday"
import { getProvider } from "@/lib/messaging/provider"
import { sendMessages } from "@/lib/messaging/send"
import type { SendResult } from "@/lib/messaging/types"
import { isBirthdayLiveSendEnabled, isTwilioContentSid } from "@/lib/birthday-live-gate"
import type { ProviderTemplate } from "@/lib/messaging/types"

export type SchedulerResult = {
  companiesProcessed: number
  renewalSent: number
  birthdaySent: number
  errors: string[]
}

function getLocalDayBoundaries(): MuscatBusinessDayBounds {
  return getMuscatBusinessDayBounds()
}

export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function renderTemplate(
  body: string,
  customer: { customer_name: string; veh_make_model?: string | null; policy_expiry_date?: string | null; new_premium_vat_amount?: number | null },
  companyName: string,
  daysRemaining?: number,
): string {
  return body
    .replace(/\{\{customer_name\}\}/g, customer.customer_name)
    .replace(/\{\{veh_make_model\}\}/g, customer.veh_make_model ?? "")
    .replace(/\{\{policy_expiry_date\}\}/g, customer.policy_expiry_date ?? "")
    .replace(/\{\{days_remaining\}\}/g, daysRemaining != null ? String(daysRemaining) : "")
    .replace(/\{\{new_premium_vat_amount\}\}/g, customer.new_premium_vat_amount != null ? String(customer.new_premium_vat_amount) : "")
    .replace(/\{\{company_name\}\}/g, companyName)
}

type CustomerRecord = {
  id: string
  customer_name: string
  mobile_no: string
  veh_make_model?: string | null
  policy_expiry_date?: string | null
  new_premium_vat_amount?: number | null
  communication_status: string
  driver_dob?: string | null
}

type CompanyRow = { id: string; name: string }

type ClaimedMessage = {
  idempotencyKey: string
  mobile: string
  body: string
  errorPrefix: string
  template?: ProviderTemplate
}

// ─── Idempotency keys ────────────────────────────────────────

function renewalIdempotencyKey(
  companyId: string,
  customerRecordId: string,
  reminderStage: number,
  businessDate: string,
): string {
  return `scheduler:renewal:${companyId}:${customerRecordId}:${reminderStage}:${businessDate}`
}

function birthdayIdempotencyKey(
  companyId: string,
  normalizedMobile: string,
  businessDate: string,
): string {
  return `birthday:${companyId}:${normalizedMobile}:${businessDate.slice(0, 4)}`
}

type BirthdayClaimOutcome = "claimed" | "duplicate" | "limit_reached" | "budget_reached" | "mode_blocked" | "template_unavailable" | "customer_ineligible" | "company_suspended" | "settings_unavailable" | "invalid_request"

export function isBirthdayDispatchDue(
  sendTime: string | null | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sendTime) return true
  if (timezone !== "Asia/Muscat") return false
  const current = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now)
  const [currentHour, currentMinute] = current.split(":").map(Number)
  const [targetHour, targetMinute] = sendTime.slice(0, 5).split(":").map(Number)
  const currentTotal = currentHour * 60 + currentMinute
  const targetTotal = targetHour * 60 + targetMinute
  return currentTotal >= targetTotal && currentTotal < targetTotal + 15
}

/**
 * Attempt an atomic INSERT with the given message row.
 * Returns true if the insert succeeded (this Scheduler won the claim).
 * Returns false on an idempotency-key unique conflict (another run already claimed it).
 * Throws for all other errors — including unrelated unique violations — so the
 * caller can report them.  Only the constrained index name is treated as a
 * benign idempotency duplicate.
 */
async function tryClaim(
  supabase: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase.from("messages").insert(row)

  if (!error) return true

  // Only treat 23505 as a benign idempotency duplicate when it originates
  // from the idempotency_key unique partial index.  Any other unique
  // violation is unexpected and must be surfaced.
  const pgError = error as { code?: string; message?: string } | null
  if (pgError?.code === "23505" && pgError.message?.includes("idx_messages_idempotency_key")) {
    return false
  }

  // Re-throw real errors (including unrelated unique violations)
  throw error
}

function failureReason(sendResult: SendResult): string {
  const reason = sendResult.error?.trim()
    || (sendResult.success ? "Provider accepted the message without returning an identifier" : "Provider rejected the message")
  return reason.slice(0, 500)
}

async function finalizeClaim(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  idempotencyKey: string,
  sendResult: SendResult,
): Promise<boolean> {
  const accepted = sendResult.success && Boolean(sendResult.providerMessageId)
  const patch = accepted
    ? {
        status: "sent" as const,
        provider_message_id: sendResult.providerMessageId,
        delivery_status: sendResult.deliveryStatus ?? null,
        failure_reason: null,
        sent_at: new Date().toISOString(),
      }
    : {
        status: "failed" as const,
        provider_message_id: sendResult.providerMessageId ?? null,
        delivery_status: sendResult.deliveryStatus ?? null,
        failure_reason: failureReason(sendResult),
        sent_at: null,
      }

  const { data, error } = await supabase
    .from("messages")
    .update(patch)
    .eq("company_id", companyId)
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "pending")
    .select("id")

  if (error) throw new Error(error.message)
  if (!data || data.length !== 1) {
    throw new Error("Expected exactly one tenant-scoped pending claim to be finalized")
  }

  return accepted
}

async function dispatchClaims(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  claims: ClaimedMessage[],
  onSent: () => void,
  errors: string[],
): Promise<void> {
  if (claims.length === 0) return

  let sendResults: SendResult[]
  try {
    sendResults = await sendMessages(claims.map(({ mobile, body, template }) => ({ mobile, body, template })))
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provider initialization failed"
    sendResults = claims.map(() => ({ success: false, error: message }))
  }

  for (let index = 0; index < claims.length; index++) {
    const claim = claims[index]
    const sendResult = sendResults[index] ?? { success: false, error: "Provider returned no result" }

    try {
      const accepted = await finalizeClaim(supabase, companyId, claim.idempotencyKey, sendResult)
      if (accepted) {
        onSent()
      } else {
        errors.push(`${claim.errorPrefix}: ${failureReason(sendResult)}`)
      }
    } catch (err) {
      const outcome = sendResult.success ? "accepted" : "rejected"
      errors.push(
        `${claim.errorPrefix}: Provider ${outcome} the message, but claim finalization failed: ${err instanceof Error ? err.message : "Update error"}`,
      )
    }
  }
}

// ─── Main Scheduler ──────────────────────────────────────────

export async function runScheduler(): Promise<SchedulerResult> {
  // Validate the provider gates before any durable claim is created. In live
  // mode this also guarantees C2's public HTTPS status callback is configured.
  getProvider()

  const supabase = createAdminClient()
  const result: SchedulerResult = { companiesProcessed: 0, renewalSent: 0, birthdaySent: 0, errors: [] }

  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name")
    .eq("is_active", true)

  if (companiesErr) {
    result.errors.push(`Failed to fetch companies: ${companiesErr.message}`)
    return result
  }

  if (!companies || companies.length === 0) return result

  for (const company of companies as CompanyRow[]) {
    try {
      result.companiesProcessed++
      const bounds = getLocalDayBoundaries()
      await processCompany(supabase, company, bounds.businessDate, bounds.startUtc, bounds.endUtcExclusive, result)
    } catch (err) {
      result.errors.push(`Company ${company.id}: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  return result
}

async function processCompany(
  supabase: ReturnType<typeof createAdminClient>,
  company: CompanyRow,
  date: string,
  startUtc: string,
  endUtcExclusive: string,
  result: SchedulerResult,
): Promise<void> {
  const { data: settings } = await supabase
    .from("reminder_settings")
    .select("reminder_days, is_active")
    .eq("company_id", company.id)
    .single()

  if (settings?.is_active) {
    await processRenewals(supabase, company, settings.reminder_days as number[], date, startUtc, endUtcExclusive, result)
  }
  await processBirthdays(supabase, company, date, result)
}

// ─── Renewals ────────────────────────────────────────────────

async function processRenewals(
  supabase: ReturnType<typeof createAdminClient>,
  company: CompanyRow,
  reminderDays: number[],
  date: string,
  startUtc: string,
  endUtcExclusive: string,
  result: SchedulerResult,
): Promise<void> {
  const { data: template } = await supabase
    .from("message_templates")
    .select("body, name")
    .eq("company_id", company.id)
    .eq("template_type", "renewal")
    .maybeSingle()

  if (!template) return

  for (const days of reminderDays) {
    const targetDate = addDaysToDate(date, days)

    const { data: customers } = await supabase
      .from("customer_records")
      .select("id, customer_name, mobile_no, veh_make_model, policy_expiry_date, new_premium_vat_amount, communication_status")
      .eq("company_id", company.id)
      .eq("communication_status", "allowed")
      .eq("policy_expiry_date", targetDate)

    if (!customers || customers.length === 0) continue

    // Dedup query: find messages already recorded within today's window for this stage
    const { data: existing } = await supabase
      .from("messages")
      .select("customer_record_id, idempotency_key")
      .eq("company_id", company.id)
      .eq("message_type", "renewal")
      .eq("reminder_stage", days)
      .gte("created_at", startUtc)
      .lt("created_at", endUtcExclusive)

    const existingKeys = new Set(existing?.map((m) => m.customer_record_id) ?? [])
    const eligible = (customers as CustomerRecord[]).filter((c) => !existingKeys.has(c.id))

    if (eligible.length === 0) continue

    const claims: ClaimedMessage[] = []

    for (const customer of eligible) {
      const key = renewalIdempotencyKey(company.id, customer.id, days, date)
      const body = renderTemplate(template.body, customer, company.name, days)

      const row = {
        company_id: company.id,
        customer_record_id: customer.id,
        message_type: "renewal" as const,
        recipient_mobile: customer.mobile_no,
        template_used: template.name,
        message_body: body,
        status: "pending" as const,
        reminder_stage: days,
        provider_message_id: null,
        delivery_status: null,
        failure_reason: null,
        sent_at: null,
        idempotency_key: key,
      }

      try {
        const claimed = await tryClaim(supabase, row)
        if (claimed) {
          claims.push({
            idempotencyKey: key,
            mobile: customer.mobile_no,
            body,
            errorPrefix: `Company ${company.id} renewal stage ${days} customer ${customer.id}`,
          })
        }
        // Not claimed → another Scheduler run already recorded this message; skip silently
      } catch (err) {
        result.errors.push(
          `Company ${company.id} renewal stage ${days} customer ${customer.id}: ${err instanceof Error ? err.message : "Insert error"}`,
        )
      }
    }

    await dispatchClaims(supabase, company.id, claims, () => { result.renewalSent++ }, result.errors)
  }
}

// ─── Birthdays ───────────────────────────────────────────────

async function processBirthdays(
  supabase: ReturnType<typeof createAdminClient>,
  company: CompanyRow,
  date: string,
  result: SchedulerResult,
): Promise<void> {
  const { data: automation } = await supabase
    .from("birthday_automation_settings")
    .select("is_enabled, template_id, send_time, timezone, limit_mode, daily_limit, monthly_limit, budget_protection_enabled, monthly_budget_baisa")
    .eq("company_id", company.id)
    .maybeSingle()

  if (!automation?.is_enabled || !automation.template_id) return
  if (!isBirthdayDispatchDue(automation.send_time, automation.timezone)) return
  if (!isBirthdayLiveSendEnabled()) return

  const { data: template } = await supabase
    .from("message_templates")
    .select("id, body, name, provider_template_id, estimated_unit_cost_baisa")
    .eq("id", automation.template_id)
    .eq("company_id", company.id)
    .eq("template_type", "birthday")
    .eq("provider_category", "marketing")
    .eq("provider_status", "approved")
    .not("provider_template_id", "is", null)
    .maybeSingle()

  if (!template || !isTwilioContentSid(template.provider_template_id)) return

  const { data: allCustomers } = await supabase
    .from("customer_records")
    .select("id, customer_name, mobile_no, veh_make_model, policy_expiry_date, new_premium_vat_amount, communication_status, driver_dob")
    .eq("company_id", company.id)
    .eq("communication_status", "allowed")
    .not("driver_dob", "is", null)

  if (!allCustomers || allCustomers.length === 0) return

  const customers = (allCustomers as CustomerRecord[]).filter((c: CustomerRecord) =>
    isBirthdayToday(c.driver_dob, date),
  )

  if (customers.length === 0) return

  // Manual and automatic paths share one annual claim identity.
  const { data: existing, error: existingError } = await supabase
    .from("messages")
    .select("customer_record_id, idempotency_key")
    .eq("company_id", company.id)
    .eq("message_type", "birthday")
    .eq("birthday_year", Number(date.slice(0, 4)))

  if (existingError) {
    result.errors.push(`Company ${company.id} birthday annual claim check: ${existingError.message}`)
    return
  }

  const existingKeys = new Set(existing?.map((m) => m.customer_record_id) ?? [])
  const eligible = customers.filter((c) => !existingKeys.has(c.id))

  if (eligible.length === 0) return

  const claims: ClaimedMessage[] = []

  for (const customer of eligible) {
    const key = birthdayIdempotencyKey(company.id, customer.mobile_no, date)
    const body = renderTemplate(template.body, customer, company.name)

    try {
      const { data, error } = await supabase.rpc("claim_birthday_message", {
        p_company_id: company.id,
        p_customer_record_id: customer.id,
        p_template_id: template.id,
        p_dispatch_source: "automatic",
        p_recipient_mobile: customer.mobile_no,
        p_message_body: body,
        p_birthday_year: Number(date.slice(0, 4)),
        p_estimated_cost_baisa: template.estimated_unit_cost_baisa ?? 0,
      })
      if (error) throw new Error(error.message)
      const outcome = (data as { outcome?: BirthdayClaimOutcome }[] | null)?.[0]?.outcome
      if (outcome === "claimed") {
        claims.push({
          idempotencyKey: key,
          mobile: customer.mobile_no,
          body,
          errorPrefix: `Company ${company.id} birthday customer ${customer.id}`,
          template: {
            contentSid: template.provider_template_id,
            variables: { "1": customer.customer_name, "2": company.name },
          },
        })
      } else if (outcome !== "duplicate") {
        result.errors.push(`Company ${company.id} birthday customer ${customer.id}: ${outcome ?? "Claim failed closed"}`)
      }
    } catch (err) {
      result.errors.push(
        `Company ${company.id} birthday customer ${customer.id}: ${err instanceof Error ? err.message : "Insert error"}`,
      )
    }
  }

  if (claims.length > 0) {
    const { data: currentSettings, error: currentSettingsError } = await supabase
      .from("birthday_automation_settings")
      .select("is_enabled")
      .eq("company_id", company.id)
      .maybeSingle()

    if (currentSettingsError || !currentSettings?.is_enabled) {
      for (const claim of claims) {
        await supabase
          .from("messages")
          .update({
            status: "canceled",
            failure_reason: "Birthday automation was disabled before provider acceptance",
          })
          .eq("company_id", company.id)
          .eq("idempotency_key", claim.idempotencyKey)
          .eq("status", "pending")
      }
      if (currentSettingsError) {
        result.errors.push(`Company ${company.id} birthday safety recheck: ${currentSettingsError.message}`)
      }
      return
    }
  }

  await dispatchClaims(supabase, company.id, claims, () => { result.birthdaySent++ }, result.errors)
}
