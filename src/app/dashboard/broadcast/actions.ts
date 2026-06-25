"use server"

import { revalidatePath } from "next/cache"
import { getProfile } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/server"
import { sendMessages } from "@/lib/messaging/send"
import { can, type ProfileLike } from "@/lib/supabase/permissions"

const PAGE_SIZE = 50

export type BroadcastRecipient = {
  id: string
  customer_name: string
  mobile_no: string
  policy_no: string
  communication_status: string
}

export type ConfirmResult = {
  success: boolean
  sent: number
  skipped: number
  error?: string
}

export type PaginatedRecipients = {
  recipients: BroadcastRecipient[]
  hasMore: boolean
}

export async function loadBroadcastTemplate(): Promise<{ body: string | null; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { body: null, error: "No company assigned" }
  if (!await can(profile as ProfileLike, "broadcast:create")) {
    return { body: null, error: "You don't have permission to prepare broadcasts" }
  }

  const supabase = await createClient()

  const { data } = await supabase
    .from("message_templates")
    .select("body")
    .eq("company_id", profile.company_id)
    .eq("template_type", "broadcast")
    .maybeSingle()

  return { body: data?.body ?? null }
}

export async function getBroadcastRecipientsPaginated(
  q: string,
  page: number = 1,
): Promise<PaginatedRecipients> {
  const profile = await getProfile()
  if (!profile?.company_id) return { recipients: [], hasMore: false }
  if (!await can(profile as ProfileLike, "broadcast:create")) {
    return { recipients: [], hasMore: false }
  }

  const supabase = await createClient()
  const fetchSize = PAGE_SIZE + 1
  const from = (page - 1) * PAGE_SIZE
  const to = from + fetchSize - 1

  let query = supabase
    .from("customer_records")
    .select("id, customer_name, mobile_no, policy_no, communication_status")
    .eq("company_id", profile.company_id)
    .order("customer_name", { ascending: true })

  const trimmed = q.trim()
  if (trimmed) {
    query = query.or(
      `customer_name.ilike.%${trimmed}%,mobile_no.ilike.%${trimmed}%,policy_no.ilike.%${trimmed}%`,
    )
  }

  const { data } = await query.range(from, to)
  const raw = data ?? []
  const hasMore = raw.length > PAGE_SIZE
  const recipients = raw.slice(0, PAGE_SIZE)

  return { recipients, hasMore }
}

export async function confirmBroadcastSelected(
  body: string,
  selectedIds: string[],
): Promise<ConfirmResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, sent: 0, skipped: 0, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, sent: 0, skipped: 0, error: "Only admins can send messages" }

  if (!body.trim()) return { success: false, sent: 0, skipped: 0, error: "Message body cannot be empty" }
  if (selectedIds.length === 0) return { success: false, sent: 0, skipped: 0, error: "No recipients selected" }
  if (selectedIds.length > 50) return { success: false, sent: 0, skipped: 0, error: "Maximum 50 recipients allowed" }

  const supabase = await createClient()

  const { data: customers } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .in("id", selectedIds)

  if (!customers || customers.length === 0) return { success: false, sent: 0, skipped: 0, error: "No matching customers found" }

  const allowedCustomers = customers.filter((c) => c.communication_status === "allowed")

  if (allowedCustomers.length === 0) {
    return { success: false, sent: 0, skipped: 0, error: "No eligible recipients" }
  }

  const companyName = (profile as any).companies?.name ?? ""

  function renderBroadcast(body: string, c: { customer_name: string }): string {
    return body
      .replace(/\{\{customer_name\}\}/g, c.customer_name)
      .replace(/\{\{company_name\}\}/g, companyName)
  }

  const recipients = allowedCustomers.map((c) => ({
    mobile: c.mobile_no,
    body: renderBroadcast(body, c),
  }))

  const results = await sendMessages(recipients)
  const now = new Date().toISOString()
  const messages = allowedCustomers.map((c, i) => ({
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
