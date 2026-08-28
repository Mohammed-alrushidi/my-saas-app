"use server"

import { revalidatePath } from "next/cache"
import { getProfile } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/server"
import { sendMessages } from "@/lib/messaging/send"
import { getProvider } from "@/lib/messaging/provider"
import { can, type ProfileLike } from "@/lib/supabase/permissions"
import { createHash } from "crypto"

const PAGE_SIZE = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  failed?: number
  error?: string
  /** True when the WhatsApp provider is in mock/sandbox mode — no real message was sent. */
  mock?: boolean
  /** Status of the existing submission when this request encountered a duplicate. */
  submissionStatus?: string
  /** True when this request was identified as a duplicate of an existing submission. */
  alreadySubmitted?: boolean
  /** True when the submission key was found but the payload hash did not match. */
  payloadMismatch?: boolean
  /** Provider dispatch may have happened, but durable history/finalization did not complete. */
  uncertain?: boolean
  /**
   * True when the existing submission has been "processing" longer than
   * STALE_PROCESSING_MS — it almost certainly never finished, so the UI
   * should offer recovery instead of asking the user to wait.
   */
  staleProcessing?: boolean
}

export type BroadcastDraftRecord = {
  id: string
  message_body: string
  recipient_ids: string[]
  status: "pending_review" | "approved" | "rejected" | "sending" | "sent" | "failed"
  review_note: string | null
  sent_count: number
  failed_count: number
  created_at: string
  reviewed_at: string | null
  sent_at: string | null
  creator_name: string | null
}

export type DraftActionResult = {
  success: boolean
  error?: string
  draftId?: string
  sendResult?: ConfirmResult
}

/**
 * A submission stuck in "processing" for at least this long is treated as
 * abandoned (crash/timeout between claim and finalize). Serverless function
 * durations are far below this threshold, so a live run is effectively
 * impossible past it. Report-only: recovery is offered to the user, we never
 * re-send automatically based on this flag.
 */
const STALE_PROCESSING_MS = 15 * 60 * 1000

function isStaleProcessing(startedAt: unknown): boolean {
  if (typeof startedAt !== "string") return false
  const startedMs = Date.parse(startedAt)
  if (!Number.isFinite(startedMs)) return false
  return Date.now() - startedMs >= STALE_PROCESSING_MS
}

/**
 * Update a broadcast submission row, always scoped to the authenticated
 * company and submission key. Never throws — callers must check `.error`
 * so a failed state-transition can be surfaced instead of silently lost.
 */
async function updateSubmission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  submissionId: string,
  patch: Record<string, unknown>,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from("broadcast_submissions")
      .update(patch)
      .eq("company_id", companyId)
      .eq("submission_key", submissionId)

    return { error: error?.message ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown submission update error" }
  }
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

function validRecipientIds(selectedIds: string[]): boolean {
  return selectedIds.length > 0
    && selectedIds.length <= 50
    && new Set(selectedIds).size === selectedIds.length
    && selectedIds.every((id) => UUID_RE.test(id))
}

export async function submitBroadcastDraft(body: string, selectedIds: string[]): Promise<DraftActionResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!profile.is_active) return { success: false, error: "Account is inactive" }
  if (!await can(profile as ProfileLike, "broadcast:create")) {
    return { success: false, error: "You don't have permission to prepare broadcasts" }
  }

  const trimmedBody = body.trim()
  if (!trimmedBody || trimmedBody.length > 1600) return { success: false, error: "Message must be between 1 and 1600 characters" }
  if (!validRecipientIds(selectedIds)) return { success: false, error: "Select between 1 and 50 valid recipients" }

  const supabase = await createClient()
  const { data: customers, error: customerError } = await supabase
    .from("customer_records")
    .select("id, communication_status")
    .eq("company_id", profile.company_id)
    .in("id", selectedIds)

  if (customerError) return { success: false, error: "Failed to validate recipients" }
  if (!customers || customers.length !== selectedIds.length) return { success: false, error: "One or more recipients do not belong to your company" }
  if (customers.some((customer) => customer.communication_status !== "allowed")) {
    return { success: false, error: "One or more recipients are no longer eligible" }
  }

  const { data: draft, error } = await supabase
    .from("broadcast_drafts")
    .insert({
      company_id: profile.company_id,
      created_by: profile.id,
      message_body: trimmedBody,
      recipient_ids: selectedIds,
      status: "pending_review",
    })
    .select("id")
    .single()

  if (error || !draft) return { success: false, error: "Failed to submit broadcast for review" }
  revalidatePath("/dashboard/broadcast")
  return { success: true, draftId: draft.id }
}

export async function getBroadcastDrafts(): Promise<BroadcastDraftRecord[]> {
  const profile = await getProfile()
  if (!profile?.company_id || !profile.is_active) return []
  if (!await can(profile as ProfileLike, "broadcast:create")) return []

  const supabase = await createClient()
  let query = supabase
    .from("broadcast_drafts")
    .select("id, message_body, recipient_ids, status, review_note, sent_count, failed_count, created_at, reviewed_at, sent_at, creator:profiles!broadcast_drafts_created_by_fkey(full_name)")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (profile.role !== "company_admin") query = query.eq("created_by", profile.id)
  const { data, error } = await query
  if (error || !data) return []

  return data.map((row) => {
    const creator = Array.isArray(row.creator) ? row.creator[0] : row.creator
    return {
      id: row.id,
      message_body: row.message_body,
      recipient_ids: row.recipient_ids,
      status: row.status,
      review_note: row.review_note,
      sent_count: row.sent_count,
      failed_count: row.failed_count,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      sent_at: row.sent_at,
      creator_name: creator?.full_name ?? null,
    }
  })
}

export async function reviewBroadcastDraft(
  draftId: string,
  decision: "approve" | "reject",
  reviewNote?: string,
): Promise<DraftActionResult> {
  if (!UUID_RE.test(draftId)) return { success: false, error: "Invalid draft identifier" }
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!profile.is_active) return { success: false, error: "Account is inactive" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can review broadcasts" }

  const note = reviewNote?.trim() || null
  if (note && note.length > 500) return { success: false, error: "Review note must be at most 500 characters" }
  const now = new Date().toISOString()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("broadcast_drafts")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_by: profile.id,
      reviewed_at: now,
      review_note: note,
    })
    .eq("id", draftId)
    .eq("company_id", profile.company_id)
    .eq("status", "pending_review")
    .select("id")

  if (error) return { success: false, error: "Failed to review broadcast" }
  if (!data || data.length !== 1) return { success: false, error: "Draft is missing, belongs to another company, or was already reviewed" }
  revalidatePath("/dashboard/broadcast")
  return { success: true, draftId }
}

export async function sendApprovedBroadcastDraft(draftId: string): Promise<DraftActionResult> {
  if (!UUID_RE.test(draftId)) return { success: false, error: "Invalid draft identifier" }
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!profile.is_active) return { success: false, error: "Account is inactive" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can send broadcasts" }

  try {
    getProvider()
  } catch {
    return { success: false, error: "Messaging provider is not configured" }
  }
  const supabase = await createClient()
  const { data: claimed, error: claimError } = await supabase
    .from("broadcast_drafts")
    .update({ status: "sending", reviewed_by: profile.id })
    .eq("id", draftId)
    .eq("company_id", profile.company_id)
    .eq("status", "approved")
    .select("id, message_body, recipient_ids")
    .maybeSingle()

  if (claimError) return { success: false, error: "Failed to claim approved broadcast" }
  if (!claimed) return { success: false, error: "Draft is missing, belongs to another company, or is no longer approved" }

  const sendResult = await confirmBroadcastSelected(claimed.message_body, claimed.recipient_ids, claimed.id)
  if (sendResult.uncertain || sendResult.submissionStatus === "uncertain" || sendResult.staleProcessing) {
    return {
      success: false,
      error: "Broadcast outcome is uncertain; check message history before taking further action",
      draftId,
      sendResult,
    }
  }

  const now = new Date().toISOString()
  const hasFailures = (sendResult.failed ?? 0) > 0
  const { data: finalized, error: finalizeError } = await supabase
    .from("broadcast_drafts")
    .update({
      status: sendResult.success && !hasFailures ? "sent" : "failed",
      reviewed_by: profile.id,
      sent_at: sendResult.sent > 0 ? now : null,
      sent_count: sendResult.sent,
      failed_count: sendResult.failed ?? 0,
      review_note: sendResult.success ? null : (sendResult.error ?? "Broadcast send failed"),
    })
    .eq("id", draftId)
    .eq("company_id", profile.company_id)
    .eq("status", "sending")
    .select("id")

  if (finalizeError || !finalized || finalized.length !== 1) {
    return { success: false, error: "Broadcast outcome is recorded in message history, but draft finalization is uncertain", draftId, sendResult }
  }

  revalidatePath("/dashboard/broadcast")
  return { success: sendResult.success, error: sendResult.error, draftId, sendResult }
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
    if (!profile.is_active) return { success: false, sent: 0, skipped: 0, error: "Account is inactive" }
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
    if (!UUID_RE.test(submissionId)) {
      return { success: false, sent: 0, skipped: 0, error: "Invalid submission identifier format" }
    }

    try {
      getProvider()
    } catch {
      return { success: false, sent: 0, skipped: 0, error: "Messaging provider is not configured" }
    }

    const { data: customers } = await supabase
      .from("customer_records")
      .select("*")
      .eq("company_id", profile.company_id)
      .in("id", selectedIds)

    if (!customers || customers.length === 0) return { success: false, sent: 0, skipped: 0, error: "No matching customers found" }

    const allowedCustomers = customers.filter((c) => c.communication_status === "allowed")
    const skippedCount = selectedIds.length - allowedCustomers.length

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
      recipient_count: selectedIds.length,
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
            failed: existing.failed_count,
            error: "Submission payload mismatch — request rejected",
            submissionStatus: existing.status,
            alreadySubmitted: true,
            payloadMismatch: true,
          }
        }

        // Safe duplicate — return existing submission state
        const isProcessing = existing.status === "processing"
        const stale = isProcessing && isStaleProcessing(existing.started_at)

        const existingError =
          isProcessing && stale ? "This broadcast appears stuck — its outcome is unknown. Please check message history and start a new broadcast." :
          isProcessing ? "Broadcast is already being processed" :
          existing.status === "uncertain" ? "Broadcast outcome is uncertain — check message history" :
          existing.status === "completed" ? undefined :
          "Broadcast previously failed — create a new broadcast"

        return {
          success: existing.status === "completed",
          sent: existing.sent_count,
          skipped: existing.skipped_count,
          failed: existing.failed_count,
          error: existingError,
          alreadySubmitted: true,
          submissionStatus: existing.status,
          ...(stale ? { staleProcessing: true } : {}),
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
      delivery_status: results[i].deliveryStatus ?? null,
      failure_reason: results[i].error ?? null,
      sent_at: results[i].success ? now : null,
    }))

    const { error: insertError } = await supabase.from("messages").insert(messages)

    if (insertError) {
      // History persistence failed — mark submission uncertain so the state is
      // recoverable rather than stranded in "processing".
      const mark = await updateSubmission(supabase, profile.company_id, submissionId, {
        status: "uncertain",
        last_error_code: "history_insert_failed",
      })

      const trackingNote = mark.error
        ? " Its tracking state could not be updated; it will be flagged as stuck automatically."
        : ""

      return { success: false, sent: 0, skipped: skippedCount, error: `Failed to save message history — broadcast may have been sent.${trackingNote}`, mock: isMock, uncertain: true }
    }

    // 7. Calculate truthful counts
    const sentCount = messages.filter((m) => m.status === "sent").length
    const failedCount = messages.filter((m) => m.status === "failed").length

    // 8. Finalize submission as completed. The messages themselves are already
    // sent and the history rows persisted, so this failure must not turn a
    // successful broadcast into a reported failure — surface it as a warning
    // instead. Stale-processing detection recovers the orphaned row.
    const finalize = await updateSubmission(supabase, profile.company_id, submissionId, {
      status: "completed",
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      completed_at: now,
    })

    if (finalize.error) {
      console.error("Failed to finalize broadcast submission:", finalize.error)
      return {
        success: true,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        mock: isMock,
        error: "Messages were sent and message history is accurate, but recording the final broadcast status failed.",
      }
    }

    return { success: true, sent: sentCount, failed: failedCount, skipped: skippedCount, mock: isMock }

  } catch (e) {
    // If the claim was made but an unexpected error occurred, mark submission uncertain
    // so the state is recoverable rather than silently lost.
    let stateNote = ""
    if (claimSucceeded && companyId && profileId) {
      const mark = await updateSubmission(supabase, companyId, submissionId, {
        status: "uncertain",
        last_error_code: "unexpected_error",
      })
      if (mark.error) {
        stateNote = " (Its tracking state could not be updated.)"
      }
    }

    console.error("confirmBroadcastSelected error:", e)
    const message = e instanceof Error ? e.message : "Unexpected error"
    return { success: false, sent: 0, skipped: 0, error: `${message}${stateNote}`, ...(claimSucceeded ? { uncertain: true } : {}) }
  }
}
