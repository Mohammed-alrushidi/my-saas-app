import { createAdminClient } from "@/lib/supabase/admin"
import { getMuscatBusinessDayBounds, type MuscatBusinessDayBounds } from "@/lib/dates/muscat-day"

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

export async function runScheduler(): Promise<SchedulerResult> {
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

  if (!settings || !settings.is_active) return

  await processRenewals(supabase, company, settings.reminder_days as number[], date, startUtc, endUtcExclusive, result)
  await processBirthdays(supabase, company, date, startUtc, endUtcExclusive, result)
}

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

    const { data: existing } = await supabase
      .from("messages")
      .select("customer_record_id")
      .eq("company_id", company.id)
      .eq("message_type", "renewal")
      .eq("reminder_stage", days)
      .gte("created_at", startUtc)
      .lt("created_at", endUtcExclusive)

    const existingKeys = new Set(existing?.map((m) => m.customer_record_id) ?? [])
    const eligible = (customers as CustomerRecord[]).filter((c) => !existingKeys.has(c.id))

    if (eligible.length === 0) continue

    const now = new Date().toISOString()
    const messages = eligible.map((c) => ({
      company_id: company.id,
      customer_record_id: c.id,
      message_type: "renewal" as const,
      recipient_mobile: c.mobile_no,
      template_used: template.name,
      message_body: renderTemplate(template.body, c, company.name, days),
      status: "sent" as const,
      reminder_stage: days,
      provider_message_id: null,
      failure_reason: null,
      sent_at: now,
    }))

    const { error: insertErr } = await supabase.from("messages").insert(messages)
    if (insertErr) {
      result.errors.push(`Company ${company.id} renewal stage ${days}: ${insertErr.message}`)
    } else {
      result.renewalSent += messages.length
    }
  }
}

async function processBirthdays(
  supabase: ReturnType<typeof createAdminClient>,
  company: CompanyRow,
  date: string,
  startUtc: string,
  endUtcExclusive: string,
  result: SchedulerResult,
): Promise<void> {
  const { data: template } = await supabase
    .from("message_templates")
    .select("body, name")
    .eq("company_id", company.id)
    .eq("template_type", "birthday")
    .maybeSingle()

  if (!template) return

  const [year, month, day] = date.split("-").map(Number)
  const monthStr = String(month).padStart(2, "0")
  const dayStr = String(day).padStart(2, "0")

  const { data: allCustomers } = await supabase
    .from("customer_records")
    .select("id, customer_name, mobile_no, veh_make_model, policy_expiry_date, new_premium_vat_amount, communication_status, driver_dob")
    .eq("company_id", company.id)
    .eq("communication_status", "allowed")
    .not("driver_dob", "is", null)

  if (!allCustomers || allCustomers.length === 0) return

  const customers = (allCustomers as CustomerRecord[]).filter((c: any) => {
    if (!c.driver_dob) return false
    const parts = String(c.driver_dob).split("-")
    return parts[1] === monthStr && parts[2] === dayStr
  })

  if (customers.length === 0) return

  const { data: existing } = await supabase
    .from("messages")
    .select("customer_record_id")
    .eq("company_id", company.id)
    .eq("message_type", "birthday")
    .gte("created_at", startUtc)
    .lt("created_at", endUtcExclusive)

  const existingKeys = new Set(existing?.map((m) => m.customer_record_id) ?? [])
  const eligible = customers.filter((c) => !existingKeys.has(c.id))

  if (eligible.length === 0) return

  const now = new Date().toISOString()
  const messages = eligible.map((c) => ({
    company_id: company.id,
    customer_record_id: c.id,
    message_type: "birthday" as const,
    recipient_mobile: c.mobile_no,
    template_used: template.name,
    message_body: renderTemplate(template.body, c, company.name),
    status: "sent" as const,
    provider_message_id: null,
    failure_reason: null,
    sent_at: now,
  }))

  const { error: insertErr } = await supabase.from("messages").insert(messages)
  if (insertErr) {
    result.errors.push(`Company ${company.id} birthdays: ${insertErr.message}`)
  } else {
    result.birthdaySent += messages.length
  }
}
