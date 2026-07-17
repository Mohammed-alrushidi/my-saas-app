"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/supabase/queries"
import { sendMessages } from "@/lib/messaging/send"
import { getMuscatBusinessDayBounds } from "@/lib/dates/muscat-day"

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

function todayStr(): string {
  return new Date().toISOString().split("T")[0]
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
  error?: string
}

const HISTORY_PAGE_SIZE = 50

// ─── History ────────────────────────────────────────────────

export async function getMessageHistory(
  messageType?: string,
  status?: string,
  page: number = 1,
): Promise<{ messages: MessageRecord[]; hasMore: boolean }> {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return { messages: [], hasMore: false }

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

  const { data } = await query
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

  const now = new Date()
  const future = new Date(now.getTime() + days * 86400000)
  const today = todayStr()
  const futureStr = future.toISOString().split("T")[0]

  const { count: totalInRange } = await supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)
    .gte("policy_expiry_date", today)
    .lte("policy_expiry_date", futureStr)

  const { data: customers } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("communication_status", "allowed")
    .gte("policy_expiry_date", today)
    .lte("policy_expiry_date", futureStr)
    .order("policy_expiry_date", { ascending: true })

  if (!customers || customers.length === 0) return { customers: [], companyName: "", template: null, existingKeys: new Set<string>(), totalInRange: totalInRange ?? 0 }

  const { data: existingMessages } = await supabase
    .from("messages")
    .select("customer_record_id")
    .eq("company_id", profile.company_id)
    .eq("message_type", "renewal")
    .eq("reminder_stage", days)

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
    body: renderTemplate(template.body, c, companyName, daysBetween(c.policy_expiry_date, todayStr())),
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
    body: renderTemplate(template.body, c, companyName, daysBetween(c.policy_expiry_date, todayStr())),
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
    failure_reason: results[i].error ?? null,
    sent_at: results[i].success ? now : null,
  }))

  const { error } = await supabase.from("messages").insert(messages)
  if (error) return { success: false, sent: 0, skipped: 0, error: error.message }

  revalidatePath("/dashboard/messages")
  return { success: true, sent: messages.filter((m) => m.status === "sent").length, skipped: totalInRange - eligible.length }
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

  // Fetch customers with non-null driver_dob (no LIKE on date column)
  const { data: allCustomers, error: customersErr } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("communication_status", "allowed")
    .not("driver_dob", "is", null)

  if (customersErr) return { customers: [], companyName, companyId: profile.company_id, template, templateError, customerError: customersErr.message, existingKeys: new Set<string>(), role: profile.role }

  // Filter by today's month and day in JS (avoids LIKE on date column)
  const now = new Date()
  const monthStr = String(now.getMonth() + 1).padStart(2, "0")
  const dayStr = String(now.getDate()).padStart(2, "0")

  const customers = (allCustomers ?? [])
    .filter((c) => {
      if (!c.driver_dob) return false
      const parts = String(c.driver_dob).split("-")
      return parts[1] === monthStr && parts[2] === dayStr
    })
    .sort((a, b) => String(a.driver_dob).localeCompare(String(b.driver_dob)))

  const { startUtc, endUtcExclusive } = getMuscatBusinessDayBounds()

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
    failure_reason: results[i].error ?? null,
    sent_at: results[i].success ? now : null,
  }))

  const { error } = await supabase.from("messages").insert(messages)
  if (error) return { success: false, sent: 0, skipped: 0, error: error.message }

  revalidatePath("/dashboard/messages")
  return { success: true, sent: messages.filter((m) => m.status === "sent").length, skipped: customers.length - eligible.length }
}

// ─── Broadcast ──────────────────────────────────────────────

async function getEligibleBroadcastCustomers() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return { customers: [], companyName: "" }

  const { data } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("communication_status", "allowed")
    .order("customer_name", { ascending: true })

  const companyName = (profile as any).companies?.name ?? ""

  return { customers: data ?? [], companyName }
}

export async function previewBroadcast(body: string): Promise<PreviewResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { count: 0, sample: [], error: "No company assigned" }
  if (profile.role !== "company_admin") return { count: 0, sample: [], error: "Only admins can send messages" }

  if (!body.trim()) return { count: 0, sample: [], error: "Message body cannot be empty" }

  const { customers, companyName } = await getEligibleBroadcastCustomers()
  if (customers.length === 0) return { count: 0, sample: [] }

  const sample = customers.slice(0, 3).map((c) => ({
    mobile: c.mobile_no,
    body: renderTemplate(body, c, companyName),
  }))

  return { count: customers.length, sample }
}

export async function confirmBroadcast(body: string): Promise<ConfirmResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, sent: 0, skipped: 0, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, sent: 0, skipped: 0, error: "Only admins can send messages" }

  if (!body.trim()) return { success: false, sent: 0, skipped: 0, error: "Message body cannot be empty" }

  const supabase = await createClient()

  const { customers, companyName } = await getEligibleBroadcastCustomers()
  if (customers.length === 0) return { success: true, sent: 0, skipped: 0 }

  const recipients = customers.map((c) => ({
    mobile: c.mobile_no,
    body: renderTemplate(body, c, companyName),
  }))

  const results = await sendMessages(recipients)
  const now = new Date().toISOString()
  const messages = customers.map((c, i) => ({
    company_id: profile.company_id,
    customer_record_id: c.id,
    message_type: "broadcast" as const,
    recipient_mobile: c.mobile_no,
    template_used: null,
    message_body: recipients[i].body,
    status: (results[i].success ? "sent" : "failed") as "sent" | "failed",
    provider_message_id: results[i].providerMessageId ?? null,
    failure_reason: results[i].error ?? null,
    sent_at: results[i].success ? now : null,
  }))

  const { error } = await supabase.from("messages").insert(messages)
  if (error) return { success: false, sent: 0, skipped: 0, error: error.message }

  revalidatePath("/dashboard/messages")
  return { success: true, sent: messages.filter((m) => m.status === "sent").length, skipped: 0 }
}
