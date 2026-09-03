"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProfile } from "@/lib/supabase/queries"
import { can, type ProfileLike } from "@/lib/supabase/permissions"
import { getMuscatBusinessDayBounds } from "@/lib/dates/muscat-day"
import { isBirthdayToday } from "@/lib/dates/birthday"
import { getProvider } from "@/lib/messaging/provider"
import { sendMessages } from "@/lib/messaging/send"
import { isBirthdayLiveSendEnabled, isTwilioContentSid } from "@/lib/birthday-live-gate"

export type BirthdayAutomationSettings = {
  company_id: string
  is_enabled: boolean
  template_id: string | null
  send_time: string
  timezone: string
  limit_mode: "shared" | "separate"
  daily_limit: number | null
  monthly_limit: number | null
  budget_protection_enabled: boolean
  monthly_budget_baisa: number | null
  permission_confirmation_version: string | null
  permission_confirmed_at: string | null
}

export type BirthdayAutomationOverview = {
  settings: BirthdayAutomationSettings | null
  approvedTemplates: {
    id: string
    name: string
    estimated_unit_cost_baisa: number | null
  }[]
  eligibleNext30Days: number
  estimatedMonthlyCostBaisa: number | null
  exclusions: {
    optOut: number
    invalidMobile: number
    missingConsent: number
    missingDob: number
    duplicate: number
    templateUnavailable: number
  }
  canManage: boolean
  canSend: boolean
}

type UpdateBirthdayAutomationInput = {
  enabled: boolean
  templateId: string | null
  sendTime: string
  timezone: string
  limitMode: "shared" | "separate"
  dailyLimit: number | null
  monthlyLimit: number | null
  budgetProtectionEnabled: boolean
  monthlyBudgetBaisa: number | null
  confirmation: string
  permissionConfirmed: boolean
}

const ENABLE_CONFIRMATION = "ENABLE BIRTHDAY MESSAGES"
const OMAN_MOBILE = /^\+968\d{8}$/

function renderBirthdayTemplate(body: string, customerName: string, companyName: string): string {
  return body
    .replace(/\{\{customer_name\}\}/g, customerName)
    .replace(/\{\{company_name\}\}/g, companyName)
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function birthdayYearKey(companyId: string, normalizedMobile: string, businessDate: string): string {
  return `birthday:${companyId}:${normalizedMobile}:${businessDate.slice(0, 4)}`
}

async function getActiveContext() {
  const profile = await getProfile()
  const company = (profile?.companies as {
    id?: string
    name?: string
    is_active?: boolean
  } | null) ?? null
  if (
    !profile?.company_id
    || profile.is_active !== true
    || company?.is_active !== true
  ) return null
  return { profile, companyName: company.name ?? "" }
}

export async function getBirthdayAutomationOverview(): Promise<BirthdayAutomationOverview | null> {
  const context = await getActiveContext()
  if (!context) return null

  const { profile } = context
  const admin = createAdminClient()
  const [settingsResult, templatesResult, customersResult, optOutsResult] = await Promise.all([
    admin.from("birthday_automation_settings").select("*").eq("company_id", profile.company_id).maybeSingle(),
    admin
      .from("message_templates")
      .select("id, name, estimated_unit_cost_baisa")
      .eq("company_id", profile.company_id)
      .eq("template_type", "birthday")
      .eq("provider_category", "marketing")
      .eq("provider_status", "approved")
      .not("provider_template_id", "is", null),
    admin
      .from("customer_records")
      .select("id, driver_dob, mobile_no, communication_status")
      .eq("company_id", profile.company_id),
    admin
      .from("opt_outs")
      .select("mobile_no")
      .eq("company_id", profile.company_id),
  ])
  if (settingsResult.error || templatesResult.error || customersResult.error || optOutsResult.error) return null
  const settings = settingsResult.data
  const templates = templatesResult.data
  const customers = customersResult.data
  const optOuts = optOutsResult.data

  const businessDate = getMuscatBusinessDayBounds().businessDate
  const isUpcoming = (dob: string | null) => {
    if (!dob) return false
    for (let offset = 0; offset < 30; offset++) {
      if (isBirthdayToday(dob, addDays(businessDate, offset))) return true
    }
    return false
  }
  const upcoming = (customers ?? []).filter((customer) => isUpcoming(customer.driver_dob))
  const mobileCounts = new Map<string, number>()
  for (const customer of customers ?? []) {
    mobileCounts.set(customer.mobile_no, (mobileCounts.get(customer.mobile_no) ?? 0) + 1)
  }
  const optedOutMobiles = new Set((optOuts ?? []).map((row) => row.mobile_no))
  const exclusions = {
    optOut: 0,
    invalidMobile: 0,
    missingConsent: 0,
    missingDob: (customers ?? []).filter((customer) => !customer.driver_dob).length,
    duplicate: 0,
    templateUnavailable: 0,
  }
  let safetyEligible = 0
  for (const customer of upcoming) {
    if (!OMAN_MOBILE.test(customer.mobile_no)) exclusions.invalidMobile++
    else if (optedOutMobiles.has(customer.mobile_no)) exclusions.optOut++
    else if (customer.communication_status !== "allowed") exclusions.missingConsent++
    else if ((mobileCounts.get(customer.mobile_no) ?? 0) > 1) exclusions.duplicate++
    else safetyEligible++
  }
  if ((templates ?? []).length === 0) exclusions.templateUnavailable = safetyEligible
  const eligibleNext30Days = (templates ?? []).length > 0 ? safetyEligible : 0
  const unitCost = templates?.find((template) => template.id === settings?.template_id)?.estimated_unit_cost_baisa
    ?? templates?.[0]?.estimated_unit_cost_baisa
    ?? null

  return {
    settings: settings as BirthdayAutomationSettings | null,
    approvedTemplates: templates ?? [],
    eligibleNext30Days,
    estimatedMonthlyCostBaisa: unitCost == null ? null : unitCost * eligibleNext30Days,
    exclusions,
    canManage: profile.role === "company_admin",
    canSend: await can(profile as ProfileLike, "birthday:send"),
  }
}

export async function updateBirthdayAutomation(
  input: UpdateBirthdayAutomationInput,
): Promise<{ success: boolean; error?: string }> {
  const context = await getActiveContext()
  if (!context) return { success: false, error: "inactive_context" }
  const { profile } = context
  if (profile.role !== "company_admin") return { success: false, error: "admin_only" }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime)) return { success: false, error: "invalid_send_time" }
  if (input.timezone !== "Asia/Muscat") return { success: false, error: "unsupported_timezone" }
  if (input.limitMode === "separate" && (
    input.dailyLimit == null || input.monthlyLimit == null
    || !Number.isInteger(input.dailyLimit) || !Number.isInteger(input.monthlyLimit)
    || input.dailyLimit <= 0 || input.monthlyLimit <= 0
  )) {
    return { success: false, error: "separate_limits_required" }
  }
  if (input.budgetProtectionEnabled && (
    input.monthlyBudgetBaisa == null
    || !Number.isInteger(input.monthlyBudgetBaisa)
    || input.monthlyBudgetBaisa < 0
  )) {
    return { success: false, error: "budget_required" }
  }
  if (input.enabled && input.confirmation !== ENABLE_CONFIRMATION) {
    return { success: false, error: "confirmation_required" }
  }

  const admin = createAdminClient()
  const { data: currentSettings, error: currentSettingsError } = await admin
    .from("birthday_automation_settings")
    .select("permission_confirmation_version")
    .eq("company_id", profile.company_id)
    .maybeSingle()
  if (currentSettingsError || !currentSettings) return { success: false, error: "settings_unavailable" }
  if (input.enabled && !input.permissionConfirmed && currentSettings?.permission_confirmation_version !== "birthday-contact-v1") {
    return { success: false, error: "permission_confirmation_required" }
  }
  if (input.enabled) {
    const { data: template, error: templateError } = await admin
      .from("message_templates")
      .select("id")
      .eq("id", input.templateId)
      .eq("company_id", profile.company_id)
      .eq("template_type", "birthday")
      .eq("provider_category", "marketing")
      .eq("provider_status", "approved")
      .not("provider_template_id", "is", null)
      .maybeSingle()
    if (templateError || !template) return { success: false, error: "approved_marketing_template_required" }
  }

  const patch = {
    is_enabled: input.enabled,
    template_id: input.templateId,
    send_time: input.sendTime,
    timezone: input.timezone,
    limit_mode: input.limitMode,
    daily_limit: input.limitMode === "separate" ? input.dailyLimit : 250,
    monthly_limit: input.limitMode === "separate" ? input.monthlyLimit : 5000,
    budget_protection_enabled: input.budgetProtectionEnabled,
    monthly_budget_baisa: input.budgetProtectionEnabled ? input.monthlyBudgetBaisa : null,
    enabled_by: input.enabled ? profile.id : null,
    enabled_at: input.enabled ? new Date().toISOString() : null,
    ...(input.permissionConfirmed ? {
      permission_confirmation_version: "birthday-contact-v1",
      permission_confirmed_by: profile.id,
      permission_confirmed_at: new Date().toISOString(),
    } : {}),
  }

  const { error } = await admin
    .from("birthday_automation_settings")
    .update(patch)
    .eq("company_id", profile.company_id)
  if (error) return { success: false, error: "settings_update_failed" }

  await admin.from("birthday_automation_audit").insert({
    company_id: profile.company_id,
    actor_id: profile.id,
    action: input.enabled ? "enabled" : "disabled",
    details: {
      template_id: input.templateId,
      send_time: input.sendTime,
      timezone: input.timezone,
      permission_confirmation_version: input.permissionConfirmed ? "birthday-contact-v1" : currentSettings?.permission_confirmation_version,
    },
  })

  revalidatePath("/dashboard/settings")
  revalidatePath("/dashboard/birthdays")
  return { success: true }
}

export async function sendBirthdayNow(
  customerId: string,
): Promise<{ success: boolean; state?: "sent" | "failed" | "duplicate"; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { success: false, error: "invalid_customer" }
  const context = await getActiveContext()
  if (!context) return { success: false, error: "inactive_context" }
  const { profile, companyName } = context
  if (!await can(profile as ProfileLike, "birthday:send")) return { success: false, error: "permission_required" }

  const admin = createAdminClient()
  const { data: settings, error: settingsError } = await admin
    .from("birthday_automation_settings")
    .select("is_enabled, budget_protection_enabled, monthly_budget_baisa, limit_mode, daily_limit, monthly_limit")
    .eq("company_id", profile.company_id)
    .maybeSingle()
  if (settingsError || !settings || settings.is_enabled) return { success: false, error: "manual_send_disabled" }

  const { data: customer, error: customerError } = await admin
    .from("customer_records")
    .select("id, customer_name, mobile_no, driver_dob, communication_status")
    .eq("id", customerId)
    .eq("company_id", profile.company_id)
    .maybeSingle()
  const businessDate = getMuscatBusinessDayBounds().businessDate
  if (customerError || !customer || !isBirthdayToday(customer.driver_dob, businessDate)) return { success: false, error: "not_birthday_today" }
  if (customer.communication_status !== "allowed" || !OMAN_MOBILE.test(customer.mobile_no)) {
    return { success: false, error: "customer_not_eligible" }
  }
  const { data: optOut, error: optOutError } = await admin
    .from("opt_outs")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("mobile_no", customer.mobile_no)
    .maybeSingle()
  if (optOutError || optOut) return { success: false, error: optOut ? "customer_opted_out" : "opt_out_check_unavailable" }

  const { data: template, error: templateError } = await admin
    .from("message_templates")
    .select("id, name, body, provider_template_id, estimated_unit_cost_baisa")
    .eq("company_id", profile.company_id)
    .eq("template_type", "birthday")
    .eq("provider_category", "marketing")
    .eq("provider_status", "approved")
    .not("provider_template_id", "is", null)
    .maybeSingle()
  if (templateError || !template || !isTwilioContentSid(template.provider_template_id)) {
    return { success: false, error: "approved_marketing_template_required" }
  }

  try {
    getProvider()
  } catch {
    return { success: false, error: "provider_not_ready" }
  }

  const estimatedCost = template.estimated_unit_cost_baisa ?? 0
  if (!isBirthdayLiveSendEnabled()) return { success: false, error: "birthday_live_send_disabled" }

  const idempotencyKey = birthdayYearKey(profile.company_id, customer.mobile_no, businessDate)
  const messageBody = renderBirthdayTemplate(template.body, customer.customer_name, companyName)
  const { data: claimData, error: claimError } = await admin.rpc("claim_birthday_message", {
    p_company_id: profile.company_id,
    p_customer_record_id: customer.id,
    p_template_id: template.id,
    p_dispatch_source: "manual",
    p_recipient_mobile: customer.mobile_no,
    p_message_body: messageBody,
    p_birthday_year: Number(businessDate.slice(0, 4)),
    p_estimated_cost_baisa: estimatedCost,
  })
  if (claimError) return { success: false, error: "claim_failed" }
  const claimOutcome = (claimData as { outcome?: string }[] | null)?.[0]?.outcome
  if (claimOutcome === "duplicate") return { success: false, state: "duplicate", error: "already_claimed" }
  if (claimOutcome !== "claimed") return { success: false, error: claimOutcome ?? "claim_failed" }

  let sendResult: Awaited<ReturnType<typeof sendMessages>>[number] | undefined
  try {
    ;[sendResult] = await sendMessages([{
      mobile: customer.mobile_no,
      body: messageBody,
      template: {
        contentSid: template.provider_template_id,
        variables: { "1": customer.customer_name, "2": companyName },
      },
    }])
  } catch (error) {
    sendResult = {
      success: false,
      error: error instanceof Error ? error.message : "Provider failed",
      mobile: customer.mobile_no,
    }
  }
  const safeSendResult = sendResult ?? { success: false, error: "Provider returned no result", mobile: customer.mobile_no }
  const accepted = Boolean(safeSendResult.success && safeSendResult.providerMessageId)
  const { error: finalizeError } = await admin
    .from("messages")
    .update(accepted ? {
      status: "sent",
      provider_message_id: safeSendResult.providerMessageId,
      delivery_status: safeSendResult.deliveryStatus ?? null,
      failure_reason: null,
      sent_at: new Date().toISOString(),
    } : {
      status: "failed",
      provider_message_id: safeSendResult.providerMessageId ?? null,
      delivery_status: safeSendResult.deliveryStatus ?? null,
      failure_reason: (safeSendResult.error ?? "Provider rejected the message").slice(0, 500),
      sent_at: null,
    })
    .eq("company_id", profile.company_id)
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "pending")
  if (finalizeError) return { success: false, error: "finalize_failed" }

  await admin.from("birthday_automation_audit").insert({
    company_id: profile.company_id,
    actor_id: profile.id,
    action: accepted ? "manual_sent" : "manual_blocked",
    details: { customer_record_id: customer.id, idempotency_key: idempotencyKey },
  })

  revalidatePath("/dashboard/birthdays")
  revalidatePath("/dashboard/messages")
  return accepted ? { success: true, state: "sent" } : { success: false, state: "failed", error: "provider_failed" }
}
