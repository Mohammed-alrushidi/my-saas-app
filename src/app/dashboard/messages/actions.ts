"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/supabase/queries"
import { sendMessages } from "@/lib/messaging/send"
import { getProvider } from "@/lib/messaging/provider"
import { getMuscatBusinessDayBounds, muscatExpiryWindow } from "@/lib/dates/muscat-day"
import { isBirthdayToday } from "@/lib/dates/birthday"

function renderTemplate(
  body: string,
  customer: { customer_name: string; veh_make_model?: string | null; policy_expiry_date?: string; new_premium_vat_amount?: number | null },
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

function daysBetween(future: string, today: string): number {
  const f = new Date(future)
  const t = new Date(today)
  return Math.ceil((f.getTime() - t.getTime()) / 86400000)
}

export type MessageRecord = {
  id: string
  message_type: string
  recipient_mobile: string
  template_used: string | null
  message_body: string
  status: string
  failure_reason: string | null
  reminder_stage: number | null
  sent_at: string | null
  created_at: string
  provider_message_id: string | null
  delivery_status: string | null
  customer_name: string | null
}

export type PreviewResult = {
  count: number
  sample: { mobile: string; body: string }[]
  error?: string
}

export type ConfirmResult = {
  success: boolean
  sent: number
  skipped: number
  failed?: number
  error?: string
}

const HISTORY_PAGE_SIZE = 50
const MESSAGE_STATUSES = new Set(["pending", "sent", "failed", "skipped"])
const MESSAGE_TYPES = new Set(["renewal", "birthday", "broadcast"])
const DELIVERY_FILTERS = new Set(["queued", "sent", "delivered", "undelivered", "failed"])
const MAX_RETRY_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── History ────────────────────────────────────────────────

export async function getMessageHistory(
  messageType?: string,
  status?: string,
  page: number = 1,
  deliveryStatus?: string,
): Promise<{ messages: MessageRecord[]; hasMore: boolean; error?: string }> {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return { messages: [], hasMore: false }
  if (messageType && messageType !== "all" && !MESSAGE_TYPES.has(messageType)) {
    return { messages: [], hasMore: false, error: "Invalid message type filter" }
  }
  if (status && status !== "all" && !MESSAGE_STATUSES.has(status)) {
    return { messages: [], hasMore: false, error: "Invalid message status filter" }
  }
  if (deliveryStatus && deliveryStatus !== "all" && !DELIVERY_FILTERS.has(deliveryStatus)) {
    return { messages: [], hasMore: false, error: "Invalid delivery status filter" }
  }

  const fetchSize = HISTORY_PAGE_SIZE + 1
  const from = (page - 1) * HISTORY_PAGE_SIZE
  const to = from + fetchSize - 1

  let query = supabase
    .from("messages")
    .select("*, customer_records!messages_customer_record_id_fkey(customer_name)")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (messageType && messageType !== "all") {
    query = query.eq("message_type", messageType)
  }
  if (status && status !== "all") {
    query = query.eq("status", status)
  }
  if (deliveryStatus && deliveryStatus !== "all") {
    query = query.eq("delivery_status", deliveryStatus)
  }

  const { data, error: queryError } = await query
  if (queryError) {
    return { messages: [], hasMore: false, error: "Failed to load message history" }
  }
  const raw = data ?? []
  const hasMore = raw.length > HISTORY_PAGE_SIZE
  const slice = raw.slice(0, HISTORY_PAGE_SIZE)

  const messages: MessageRecord[] = slice.map((r: any) => ({
    id: r.id,
    message_type: r.message_type,
    recipient_mobile: r.recipient_mobile,
    template_used: r.template_used,
    message_body: r.message_body,
    status: r.status,
    failure_reason: r.failure_reason,
    reminder_stage: r.reminder_stage,
    sent_at: r.sent_at,
    created_at: r.created_at,
    provider_message_id: r.provider_message_id,
    delivery_status: r.delivery_status,
    customer_name: r.customer_records?.customer_name ?? null,
  }))

  return { messages, hasMore }
}

export type RetryMessageResult = {
  success: boolean
  error?: string
  retryAfterSeconds?: number
  attempt?: number
  messageId?: string
  mock?: boolean
}

export async function retryFailedMessage(messageId: string): Promise<RetryMessageResult> {
  if (!UUID_RE.test(messageId)) return { success: false, error: "Invalid message identifier" }

  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!profile.is_active) return { success: false, error: "Account is inactive" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can retry messages" }

  const supabase = await createClient()
  const { data: source, error: sourceError } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("company_id", profile.company_id)
    .maybeSingle()

  if (sourceError || !source) return { success: false, error: "Message not found" }
  if (source.status !== "failed" && !["failed", "undelivered"].includes(source.delivery_status ?? "")) {
    return { success: false, error: "Only failed or undelivered messages can be retried" }
  }

  const rootId = source.retry_of_message_id ?? source.id
  const { data: priorAttempts, error: attemptsError } = await supabase
    .from("messages")
    .select("id, status, delivery_status, retry_attempt, created_at")
    .eq("company_id", profile.company_id)
    .eq("retry_of_message_id", rootId)
    .order("retry_attempt", { ascending: false })
    .limit(1)

  if (attemptsError) return { success: false, error: "Failed to inspect retry history" }
  const latest = priorAttempts?.[0] ?? null
  if (latest && (latest.status === "pending" || latest.status === "sent")) {
    return { success: false, error: latest.status === "pending" ? "A retry is already in progress" : "A retry already succeeded" }
  }

  const attempt = (latest?.retry_attempt ?? 0) + 1
  if (attempt > MAX_RETRY_ATTEMPTS) return { success: false, error: "Maximum retry attempts reached" }

  const previousCreatedAt = latest?.created_at ?? source.created_at
  const retryNotBeforeMs = Date.parse(previousCreatedAt) + RETRY_BACKOFF_MS[attempt - 1]
  const waitMs = retryNotBeforeMs - Date.now()
  if (!Number.isFinite(retryNotBeforeMs) || waitMs > 0) {
    return {
      success: false,
      error: "Retry backoff is still active",
      retryAfterSeconds: Number.isFinite(waitMs) ? Math.max(1, Math.ceil(waitMs / 1000)) : undefined,
    }
  }

  if (source.customer_record_id) {
    const { data: customer } = await supabase
      .from("customer_records")
      .select("id, communication_status")
      .eq("id", source.customer_record_id)
      .eq("company_id", profile.company_id)
      .maybeSingle()
    if (!customer || customer.communication_status !== "allowed") {
      return { success: false, error: "Recipient is no longer eligible for messaging" }
    }
  }

  const { data: optOut } = await supabase
    .from("opt_outs")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("mobile_no", source.recipient_mobile)
    .maybeSingle()
  if (optOut) return { success: false, error: "Recipient has opted out" }

  // Validate the configured provider before claiming a retry. In production this
  // fails closed; with MOCK_MODE=true it only creates the no-network provider.
  try {
    getProvider()
  } catch {
    return { success: false, error: "Messaging provider is not configured" }
  }

  const retryNotBefore = new Date(retryNotBeforeMs).toISOString()
  const claim = {
    company_id: profile.company_id,
    customer_record_id: source.customer_record_id,
    message_type: source.message_type,
    recipient_mobile: source.recipient_mobile,
    template_used: source.template_used,
    message_body: source.message_body,
    status: "pending",
    reminder_stage: source.reminder_stage,
    idempotency_key: `retry:${rootId}:${attempt}`,
    retry_of_message_id: rootId,
    retry_attempt: attempt,
    retry_not_before: retryNotBefore,
  }

  const { data: claimed, error: claimError } = await supabase
    .from("messages")
    .insert(claim)
    .select("id")
    .single()

  if (claimError) {
    if (claimError.code === "23505") return { success: false, error: "This retry attempt was already claimed" }
    return { success: false, error: "Failed to claim retry" }
  }

  const [sendResult] = await sendMessages([{ mobile: source.recipient_mobile, body: source.message_body }])
  const now = new Date().toISOString()
  const finalStatus = sendResult.success ? "sent" : "failed"
  const { data: finalized, error: finalizeError } = await supabase
    .from("messages")
    .update({
      status: finalStatus,
      provider_message_id: sendResult.providerMessageId ?? null,
      delivery_status: sendResult.deliveryStatus ?? null,
      failure_reason: sendResult.success ? null : (sendResult.error ?? "Provider rejected the retry"),
      sent_at: sendResult.success ? now : null,
    })
    .eq("id", claimed.id)
    .eq("company_id", profile.company_id)
    .eq("status", "pending")
    .select("id")

  if (finalizeError || !finalized || finalized.length !== 1) {
    return { success: false, error: "Retry outcome is uncertain; check message history before trying again", attempt, messageId: claimed.id }
  }

  revalidatePath("/dashboard/messages")
  return {
    success: sendResult.success,
    error: sendResult.success ? undefined : (sendResult.error ?? "Provider rejected the retry"),
    attempt,
    messageId: claimed.id,
    mock: sendResult.providerMessageId?.startsWith("mock-") ?? false,
  }
}

// ─── Renewal ────────────────────────────────────────────────

async function loadTemplate(templateType: string) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return null

  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("template_type", templateType)
    .single()

  return data
}

async function getEligibleRenewals(days: number) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return { customers: [], companyName: "", template: null, existingKeys: new Set<string>(), totalInRange: 0 }

  const { start, end } = muscatExpiryWindow(new Date(), days)

  const { count: totalInRange } = await supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)
    .gte("policy_expiry_date", start)
    .lte("policy_expiry_date", end)

  const { data: customers } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("communication_status", "allowed")
    .gte("policy_expiry_date", start)
    .lte("policy_expiry_date", end)
    .order("policy_expiry_date", { ascending: true })

  if (!customers || customers.length === 0) return { customers: [], companyName: "", template: null, existingKeys: new Set<string>(), totalInRange: totalInRange ?? 0 }

  const bounds = getMuscatBusinessDayBounds()

  const { data: existingMessages } = await supabase
    .from("messages")
    .select("customer_record_id")
    .eq("company_id", profile.company_id)
    .eq("message_type", "renewal")
    .eq("reminder_stage", days)
    .gte("created_at", bounds.startUtc)
    .lt("created_at", bounds.endUtcExclusive)

  const existingKeys = new Set(existingMessages?.map((m) => m.customer_record_id) ?? [])

  const { data: template } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("template_type", "renewal")
    .maybeSingle()

  const companyName = (profile as any).companies?.name ?? ""

  return { customers, companyName, template, existingKeys, totalInRange: totalInRange ?? 0 }
}

export async function previewRenewal(days: number): Promise<PreviewResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { count: 0, sample: [], error: "No company assigned" }
  if (profile.role !== "company_admin") return { count: 0, sample: [], error: "Only admins can send messages" }

  const supabase = await createClient()

  const { data: settings } = await supabase
    .from("reminder_settings")
    .select("reminder_days")
    .eq("company_id", profile.company_id)
    .single()

  if (!settings || !settings.reminder_days.includes(days)) {
    return { count: 0, sample: [], error: "Invalid reminder day" }
  }

  const { customers, companyName, template, existingKeys } = await getEligibleRenewals(days)

  if (!template) return { count: 0, sample: [], error: "No renewal template found" }

  const eligible = customers.filter((c) => !existingKeys.has(c.id))
  if (eligible.length === 0) return { count: 0, sample: [] }

  const sample = eligible.slice(0, 3).map((c) => ({
    mobile: c.mobile_no,
    body: renderTemplate(template.body, c, companyName, daysBetween(c.policy_expiry_date, getMuscatBusinessDayBounds().businessDate)),
  }))

  return { count: eligible.length, sample }
}

export async function confirmRenewal(days: number): Promise<ConfirmResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, sent: 0, skipped: 0, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, sent: 0, skipped: 0, error: "Only admins can send messages" }

  const supabase = await createClient()

  const { data: settings } = await supabase
    .from("reminder_settings")
    .select("reminder_days")
    .eq("company_id", profile.company_id)
    .single()

  if (!settings || !settings.reminder_days.includes(days)) {
    return { success: false, sent: 0, skipped: 0, error: "Invalid reminder day" }
  }

  const { customers, companyName, template, existingKeys, totalInRange } = await getEligibleRenewals(days)

  if (!template) return { success: false, sent: 0, skipped: 0, error: "No renewal template found" }

  const eligible = customers.filter((c) => !existingKeys.has(c.id))
  if (eligible.length === 0) return { success: true, sent: 0, skipped: 0 }

  const recipients = eligible.map((c) => ({
    mobile: c.mobile_no,
    body: renderTemplate(template.body, c, companyName, daysBetween(c.policy_expiry_date, getMuscatBusinessDayBounds().businessDate)),
  }))

  const results = await sendMessages(recipients)
  const now = new Date().toISOString()
  const messages = eligible.map((c, i) => ({
    company_id: profile.company_id,
    customer_record_id: c.id,
    message_type: "renewal" as const,
    recipient_mobile: c.mobile_no,
    template_used: template.name,
    message_body: recipients[i].body,
    status: (results[i].success ? "sent" : "failed") as "sent" | "failed",
    reminder_stage: days,
    provider_message_id: results[i].providerMessageId ?? null,
    delivery_status: results[i].deliveryStatus ?? null,
    failure_reason: results[i].error ?? null,
    sent_at: results[i].success ? now : null,
  }))

  const { error } = await supabase.from("messages").insert(messages)
  if (error) return { success: false, sent: 0, skipped: 0, error: error.message }

  revalidatePath("/dashboard/messages")
  return {
    success: true,
    sent: messages.filter((m) => m.status === "sent").length,
    failed: messages.filter((m) => m.status === "failed").length,
    skipped: totalInRange - eligible.length,
  }
}

// ─── Birthday ───────────────────────────────────────────────

async function getEligibleBirthdays() {
  const supabase = await createClient()

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) return { customers: [], companyName: "", companyId: "", template: null, templateError: userErr?.message ?? "Unauthenticated", customerError: null, existingKeys: new Set<string>(), role: "" }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*, companies(*)")
    .eq("id", user.id)
    .single()

  if (profileErr || !profile?.company_id) return { customers: [], companyName: "", companyId: "", template: null, templateError: profileErr?.message ?? null, customerError: null, existingKeys: new Set<string>(), role: profile?.role ?? "" }

  // Query template FIRST — independent of customer data, never skipped
  const { data: template, error: templateErr } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("template_type", "birthday")
    .maybeSingle()

  const templateError = templateErr?.message ?? null
  const companyName = (profile as any).companies?.name ?? ""

  // Fetch customers with non-null driver_dob aligned to Muscat business date
  const bounds = getMuscatBusinessDayBounds()
  const businessDate = bounds.businessDate

  const { data: allCustomers, error: customersErr } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("communication_status", "allowed")
    .not("driver_dob", "is", null)

  if (customersErr) return { customers: [], companyName, companyId: profile.company_id, template, templateError: customersErr.message, customerError: customersErr.message, existingKeys: new Set<string>(), role: profile.role }

  const customers = (allCustomers ?? [])
    .filter((c) => isBirthdayToday(c.driver_dob, businessDate))
    .sort((a, b) => String(a.driver_dob).localeCompare(String(b.driver_dob)))

  const { startUtc, endUtcExclusive } = bounds

  const { data: existingMessages, error: existingErr } = await supabase
    .from("messages")
    .select("customer_record_id")
    .eq("company_id", profile.company_id)
    .eq("message_type", "birthday")
    .gte("created_at", startUtc)
    .lt("created_at", endUtcExclusive)

  if (existingErr) return { customers, companyName, companyId: profile.company_id, template, templateError, customerError: existingErr.message, existingKeys: new Set<string>(), role: profile.role }

  const existingKeys = new Set(existingMessages?.map((m) => m.customer_record_id) ?? [])

  return { customers, companyName, companyId: profile.company_id, template, templateError, customerError: null, existingKeys, role: profile.role }
}

export async function previewBirthdays(): Promise<PreviewResult> {
  const { customers, companyName, template, templateError, customerError, existingKeys, role } = await getEligibleBirthdays()
  if (templateError) return { count: 0, sample: [], error: templateError }
  if (customerError) return { count: 0, sample: [], error: customerError }
  if (role !== "company_admin") return { count: 0, sample: [], error: "Only admins can send messages" }
  if (!template) return { count: 0, sample: [], error: "No birthday template found" }

  const eligible = customers.filter((c) => !existingKeys.has(c.id))
  if (eligible.length === 0) return { count: 0, sample: [] }

  const sample = eligible.slice(0, 3).map((c) => ({
    mobile: c.mobile_no,
    body: renderTemplate(template.body, c, companyName),
  }))

  return { count: eligible.length, sample }
}

export async function confirmBirthdays(): Promise<ConfirmResult> {
  const { customers, companyName, companyId, template, templateError, customerError, existingKeys, role } = await getEligibleBirthdays()
  if (templateError) return { success: false, sent: 0, skipped: 0, error: templateError }
  if (customerError) return { success: false, sent: 0, skipped: 0, error: customerError }
  if (role !== "company_admin") return { success: false, sent: 0, skipped: 0, error: "Only admins can send messages" }
  if (!template) return { success: false, sent: 0, skipped: 0, error: "No birthday template found" }

  const supabase = await createClient()

  const eligible = customers.filter((c) => !existingKeys.has(c.id))
  if (eligible.length === 0) return { success: true, sent: 0, skipped: customers.length }

  const recipients = eligible.map((c) => ({
    mobile: c.mobile_no,
    body: renderTemplate(template.body, c, companyName),
  }))

  const results = await sendMessages(recipients)
  const now = new Date().toISOString()
  const messages = eligible.map((c, i) => ({
    company_id: companyId,
    customer_record_id: c.id,
    message_type: "birthday" as const,
    recipient_mobile: c.mobile_no,
    template_used: template.name,
    message_body: recipients[i].body,
    status: (results[i].success ? "sent" : "failed") as "sent" | "failed",
    provider_message_id: results[i].providerMessageId ?? null,
    delivery_status: results[i].deliveryStatus ?? null,
    failure_reason: results[i].error ?? null,
    sent_at: results[i].success ? now : null,
  }))

  const { error } = await supabase.from("messages").insert(messages)
  if (error) return { success: false, sent: 0, skipped: 0, error: error.message }

  revalidatePath("/dashboard/messages")
  return {
    success: true,
    sent: messages.filter((m) => m.status === "sent").length,
    failed: messages.filter((m) => m.status === "failed").length,
    skipped: customers.length - eligible.length,
  }
}

// ─── Broadcast (selected-recipient flow lives in dashboard/broadcast) ───────
