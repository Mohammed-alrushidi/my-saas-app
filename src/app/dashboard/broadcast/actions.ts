"use server"

import { getProfile } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/server"
import { sendMessages } from "@/lib/messaging/send"
import { can, type ProfileLike } from "@/lib/supabase/permissions"
import { createHash } from "crypto"

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
  /** True when the WhatsApp provider is in mock/sandbox mode — no real message was sent. */
  mock?: boolean
  /** Status of the existing submission when this request encountered a duplicate. */
  submissionStatus?: string
  /** True when this request was identified as a duplicate of an existing submission. */
  alreadySubmitted?: boolean
  /** True when the submission key was found but the payload hash did not match. */
  payloadMismatch?: boolean
}

export type PaginatedRecipients = {
  recipients: BroadcastRecipient[]
  hasMore: boolean
}

/**
 * Compute a deterministic SHA-256 payload hash from the message body
 * and the selected customer IDs.
 *
 * Canonicalization is performed internally:
 * - Body is trimmed
 * - IDs are de-duplicated and sorted in place (caller array not mutated)
 */
export async function computePayloadHash(body: string, ids: string[]): Promise<string> {
  const deduped = [...new Set(ids)]
  deduped.sort()
  const canonical = JSON.stringify({ b: body.trim(), i: deduped })
  return createHash("sha256").update(canonical, "utf-8").digest("hex")
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
  submissionId: string,
): Promise<ConfirmResult> {
  const supabase = await createClient()
  let claimSucceeded = false
  let companyId: string | null = null
  let profileId: string | null = null

  try {
    const profile = await getProfile()
    if (!profile?.company_id) return { success: false, sent: 0, skipped: 0, error: "No company assigned" }
    if (profile.role !== "company_admin") return { success: false, sent: 0, skipped: 0, error: "Only admins can send messages" }

    companyId = profile.company_id
    profileId = profile.id

    if (!body.trim()) return { success: false, sent: 0, skipped: 0, error: "Message body cannot be empty" }
    if (selectedIds.length === 0) return { success: false, sent: 0, skipped: 0, error: "No recipients selected" }
    if (selectedIds.length > 50) return { success: false, sent: 0, skipped: 0, error: "Maximum 50 recipients allowed" }

    // 2. Validate submissionId
    if (!submissionId || typeof submissionId !== "string" || submissionId.length > 64) {
      return { success: false, sent: 0, skipped: 0, error: "Invalid submission identifier" }
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(submissionId)) {
      return { success: false, sent: 0, skipped: 0, error: "Invalid submission identifier format" }
    }

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

    // 3. Compute server-side canonical payload hash
    const payloadHash = await computePayloadHash(body, selectedIds)

    // 4. Atomic database claim
    const claimRow = {
      company_id: profile.company_id,
      submission_key: submissionId,
      payload_hash: payloadHash,
      status: "processing",
      recipient_count: allowedCustomers.length,
      created_by: profile.id,
    }

    const { error: claimError } = await supabase.from("broadcast_submissions").insert(claimRow)

    if (claimError) {
      const pgError = claimError as { code?: string; message?: string } | null

      // 23505 on the company/submission unique index = duplicate claim
      if (pgError?.code === "23505" && pgError.message?.includes("idx_broadcast_submissions_company_key")) {
        const { data: existing } = await supabase
          .from("broadcast_submissions")
          .select("*")
          .eq("company_id", profile.company_id)
          .eq("submission_key", submissionId)
          .single()

        if (!existing) {
          return { success: false, sent: 0, skipped: 0, error: "Duplicate claim but submission not found" }
        }

        // Payload mismatch — the same submissionId was used with different content
        if (existing.payload_hash !== payloadHash) {
          return {
            success: false,
            sent: existing.sent_count,
            skipped: existing.skipped_count,
            error: "Submission payload mismatch — request rejected",
            submissionStatus: existing.status,
            alreadySubmitted: true,
            payloadMismatch: true,
          }
        }

        // Safe duplicate — return existing submission state
        const existingError =
          existing.status === "processing" ? "Broadcast is already being processed" :
          existing.status === "uncertain" ? "Broadcast outcome is uncertain — check message history" :
          existing.status === "completed" ? undefined :
          "Broadcast previously failed — create a new broadcast"

        return {
          success: existing.status === "completed",
          sent: existing.sent_count,
          skipped: existing.skipped_count,
          error: existingError,
          alreadySubmitted: true,
          submissionStatus: existing.status,
        }
      }

      // Non-duplicate error — surface it
      throw claimError
    }

    claimSucceeded = true

    // 5. Call provider (only the winning request reaches this point)
    const results = await sendMessages(recipients)
    const isMock = results.some((r) => r.providerMessageId?.startsWith("mock-"))
    const now = new Date().toISOString()

    // 6. Build and insert real customer message-history rows
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

    const { error: insertError } = await supabase.from("messages").insert(messages)

    if (insertError) {
      // History persistence failed — mark submission uncertain
      await supabase
        .from("broadcast_submissions")
        .update({
          status: "uncertain",
          last_error_code: "history_insert_failed",
        })
        .eq("company_id", profile.company_id)
        .eq("submission_key", submissionId)

      return { success: false, sent: 0, skipped: 0, error: "Failed to save message history — broadcast may have been sent", mock: isMock }
    }

    // 7. Calculate truthful counts
    const sentCount = messages.filter((m) => m.status === "sent").length
    const failedCount = messages.filter((m) => m.status === "failed").length

    // 8. Finalize submission as completed
    await supabase
      .from("broadcast_submissions")
      .update({
        status: "completed",
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: now,
      })
      .eq("company_id", profile.company_id)
      .eq("submission_key", submissionId)

    return { success: true, sent: sentCount, skipped: 0, mock: isMock }

  } catch (e) {
    // If the claim was made but an unexpected error occurred, mark submission uncertain
    // so the state is recoverable rather than silently lost.
    if (claimSucceeded && companyId && profileId) {
      try {
        await supabase
          .from("broadcast_submissions")
          .update({
            status: "uncertain",
            last_error_code: "unexpected_error",
          })
          .eq("company_id", companyId)
          .eq("submission_key", submissionId)
      } catch {
        // Best-effort — do not mask the original error
      }
    }

    console.error("confirmBroadcastSelected error:", e)
    return { success: false, sent: 0, skipped: 0, error: e instanceof Error ? e.message : "Unexpected error" }
  }
}
