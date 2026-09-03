"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  loadBroadcastTemplate,
  getBroadcastRecipientsPaginated,
  confirmBroadcastSelected,
  getBroadcastDrafts,
  submitBroadcastDraft,
  reviewBroadcastDraft,
  sendApprovedBroadcastDraft,
} from "./actions"
import { getDashboardCapabilities } from "../role-actions"
import type { BroadcastDraftRecord, BroadcastRecipient, ConfirmResult } from "./actions"
import { Notice } from "@/components/ui/notice"
import { EmptyState } from "@/components/ui/empty-state"
import { Search, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

const MAX_RECIPIENTS = 50
const SUBMISSION_STORAGE_PREFIX = "broadcast_sub_"
type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

const DRAFT_STATUS_KEYS: Record<BroadcastDraftRecord["status"], TranslationKey> = {
  pending_review: "broadcast.statusPendingReview",
  approved: "broadcast.statusApproved",
  rejected: "broadcast.statusRejected",
  sending: "broadcast.statusSending",
  sent: "broadcast.statusSent",
  failed: "broadcast.statusFailed",
}

const COMMUNICATION_STATUS_KEYS: Record<string, TranslationKey> = {
  allowed: "broadcast.allowed",
  opted_out: "broadcast.optedOut",
  invalid_number: "broadcast.invalidNumber",
}

const BROADCAST_ERROR_KEYS: Record<string, TranslationKey> = {
  "No company assigned": "broadcast.errorNoCompany",
  "Account is inactive": "broadcast.errorInactive",
  "You don't have permission to prepare broadcasts": "broadcast.errorPreparePermission",
  "Message must be between 1 and 1600 characters": "broadcast.errorMessageLength",
  "Select between 1 and 50 valid recipients": "broadcast.errorRecipientRange",
  "Failed to validate recipients": "broadcast.errorValidateRecipients",
  "One or more recipients do not belong to your company": "broadcast.errorTenantRecipients",
  "One or more recipients are no longer eligible": "broadcast.errorIneligible",
  "Failed to submit broadcast for review": "broadcast.errorSubmit",
  "Invalid draft identifier": "broadcast.errorInvalidDraft",
  "Only admins can review broadcasts": "broadcast.errorAdminReview",
  "Review note must be at most 500 characters": "broadcast.errorReviewNote",
  "Failed to review broadcast": "broadcast.errorReview",
  "Draft is missing, belongs to another company, or was already reviewed": "broadcast.errorDraftUnavailable",
  "Only admins can send broadcasts": "broadcast.errorAdminSend",
  "Only admins can send messages": "broadcast.errorAdminSend",
  "Messaging provider is not configured": "broadcast.errorProvider",
  "Failed to claim approved broadcast": "broadcast.errorClaim",
  "Draft is missing, belongs to another company, or is no longer approved": "broadcast.errorDraftUnavailable",
  "Broadcast outcome is uncertain; check message history before taking further action": "broadcast.errorOutcomeUncertain",
  "Broadcast outcome is recorded in message history, but draft finalization is uncertain": "broadcast.errorFinalizationUncertain",
  "Message body cannot be empty": "broadcast.errorEmptyBody",
  "No recipients selected": "broadcast.errorNoRecipients",
  "Maximum 50 recipients allowed": "broadcast.errorMaxRecipients",
  "Invalid submission identifier": "broadcast.errorInvalidSubmission",
  "Invalid submission identifier format": "broadcast.errorInvalidSubmission",
  "No matching customers found": "broadcast.errorNoCustomers",
  "No eligible recipients": "broadcast.errorNoEligible",
  "Duplicate claim but submission not found": "broadcast.errorDuplicateMissing",
  "Submission payload mismatch — request rejected": "broadcast.errorPayloadMismatch",
  "Messages were sent and message history is accurate, but recording the final broadcast status failed.": "broadcast.errorStatusFinalization",
}

function translateBroadcastError(message: string | undefined, t: Translate): string {
  if (!message) return t("broadcast.errorGeneric")
  if (message.startsWith("Failed to save message history")) {
    return t("broadcast.errorTrackingUncertain")
  }
  return t(BROADCAST_ERROR_KEYS[message] ?? "broadcast.errorGeneric")
}

function translateCommunicationStatus(status: string, t: Translate): string {
  const key = COMMUNICATION_STATUS_KEYS[status]
  return key ? t(key) : status
}

/** Retrieve an existing submission ID for the given payload fingerprint, or create a fresh one. */
function getOrCreateSubmissionId(fingerprint: string): string {
  const key = `${SUBMISSION_STORAGE_PREFIX}${fingerprint}`
  try {
    const raw = sessionStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.id && typeof parsed.id === "string" && parsed.created > Date.now() - 86400000) {
        return parsed.id
      }
    }
  } catch {
    // Corrupt entry — generate new below
  }
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, JSON.stringify({ id, created: Date.now(), fingerprint }))
  return id
}

/** Remove the stored submission ID for a given payload fingerprint. */
function clearSubmissionId(fingerprint: string): void {
  const key = `${SUBMISSION_STORAGE_PREFIX}${fingerprint}`
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Best-effort
  }
}

export default function BroadcastPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [body, setBody] = useState("")
  const [templateBody, setTemplateBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [recipientsLoading, setRecipientsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeQuery, setActiveQuery] = useState("")
  const [pageReady, setPageReady] = useState(false)
  const [canPrepare, setCanPrepare] = useState(false)
  const [canSend, setCanSend] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string>("")
  const [drafts, setDrafts] = useState<BroadcastDraftRecord[]>([])
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)

  // Submission idempotency state
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const submitLockRef = useRef(false)

  // Payload fingerprint — changes when body or selected recipients change
  const payloadFingerprint = useMemo(() => {
    const sorted = [...selectedIds].sort().join(",")
    return `${body.trim()}|${sorted}`
  }, [body, selectedIds])

  const fetchRecipients = useCallback(async (q: string, pageNum: number, append: boolean) => {
    setError(null)
    if (append) {
      setLoadingMore(true)
    } else {
      setRecipientsLoading(true)
    }

    try {
      const result = await getBroadcastRecipientsPaginated(q, pageNum)
      if (append) {
        setRecipients((prev) => [...prev, ...result.recipients])
      } else {
        setRecipients(result.recipients)
        if (!q.trim() && pageNum === 1) {
          setSelectedIds(new Set(result.recipients.filter((r) => r.communication_status === "allowed").map((r) => r.id)))
        }
      }
      setHasMore(result.hasMore)
      setPage(pageNum)
    } catch {
      setError(t("broadcast.errorRecipients"))
    } finally {
      if (append) {
        setLoadingMore(false)
      } else {
        setRecipientsLoading(false)
      }
    }
  }, [t])

  const refreshDrafts = useCallback(async () => {
    try {
      setDrafts(await getBroadcastDrafts())
    } catch {
      setDraftNotice(t("broadcast.errorDrafts"))
    }
  }, [t])

  useEffect(() => {
    getDashboardCapabilities()
      .then((caps) => {
        if (!caps) {
          setPageReady(true)
          setRecipientsLoading(false)
          return
        }
        setCanPrepare(caps.canPrepareBroadcast)
        setCanSend(caps.canSendBroadcast)
        setRole(caps.role)
        setCompanyName(caps.companyName ?? "")
        setPageReady(true)

        if (caps.canPrepareBroadcast) {
          fetchRecipients("", 1, false)
          refreshDrafts()
        } else {
          setRecipientsLoading(false)
        }
      })
      .catch(() => {
        setError(t("broadcast.errorGeneric"))
        setPageReady(true)
        setRecipientsLoading(false)
      })
  }, [fetchRecipients, refreshDrafts, t])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setActiveQuery(searchQuery)
    fetchRecipients(searchQuery, 1, false)
  }

  function handleLoadMore() {
    fetchRecipients(activeQuery, page + 1, true)
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const selectable = recipients.filter(
      (r) => r.communication_status !== "opted_out" && r.communication_status !== "invalid_number",
    )
    if (selectable.every((r) => selectedIds.has(r.id))) {
      const next = new Set(selectedIds)
      for (const r of selectable) next.delete(r.id)
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      for (const r of selectable) next.add(r.id)
      setSelectedIds(next)
    }
  }

  const selectedCount = selectedIds.size
  const overLimit = selectedCount > MAX_RECIPIENTS

  const sampleMessages = recipients
    .filter((r) => selectedIds.has(r.id))
    .slice(0, 3)
    .map((r) => ({
      mobile: r.mobile_no,
      body: body.replace(/\{\{customer_name\}\}/g, r.customer_name).replace(/\{\{company_name\}\}/g, companyName),
    }))

  async function handleLoadTemplate() {
    setError(null)
    setLoading(true)
    try {
      const res = await loadBroadcastTemplate()
      if (res.error) {
        setError(translateBroadcastError(res.error, t))
      } else if (res.body) {
        setBody(res.body)
        setTemplateBody(res.body)
      } else {
        setError(t("broadcast.errorTemplateMissing"))
      }
    } catch {
      setError(t("broadcast.errorGeneric"))
    } finally {
      setLoading(false)
    }
  }

  /** Open the confirmation dialog and create/reuse a submission ID. */
  function handleOpenConfirm() {
    if (!canSend) return
    if (selectedCount === 0 || overLimit) return
    const id = getOrCreateSubmissionId(payloadFingerprint)
    setSubmissionId(id)
    setShowConfirm(true)
  }

  async function handleConfirm() {
    if (!canSend || !submissionId) return
    // Synchronous lock — prevents two click events in the same render cycle
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSending(true)
    setError(null)
    setShowConfirm(false)
    try {
      const res = await confirmBroadcastSelected(body, Array.from(selectedIds), submissionId)
      setResult(res)
      // Clean up session storage only on completed results
      if (res.success || (res.alreadySubmitted && res.submissionStatus === "completed")) {
        clearSubmissionId(payloadFingerprint)
        setSubmissionId(null)
      }
      // For processing, uncertain, and failed duplicates: retain the submission ID
      // so that repeat requests with the same ID safely re-check server state
      // rather than creating a fresh identity that could trigger a new send.
      // Stale "processing" results are recovered in the UI, which clears the
      // stored ID so the next attempt gets a fresh submission identity.
    } catch {
      setError(t("broadcast.errorGeneric"))
    } finally {
      setSending(false)
      submitLockRef.current = false
    }
  }

  async function handleSubmitForReview() {
    if (!readyToSend) return
    setDraftBusyId("new")
    setDraftNotice(null)
    try {
      const response = await submitBroadcastDraft(body, Array.from(selectedIds))
      if (!response.success) {
        setDraftNotice(translateBroadcastError(response.error, t))
        return
      }
      setDraftNotice(t("broadcast.submitted"))
      await refreshDrafts()
    } catch {
      setDraftNotice(t("broadcast.errorSubmit"))
    } finally {
      setDraftBusyId(null)
    }
  }

  async function handleDraftReview(draftId: string, decision: "approve" | "reject") {
    setDraftBusyId(draftId)
    setDraftNotice(null)
    try {
      const response = await reviewBroadcastDraft(draftId, decision)
      setDraftNotice(response.success
        ? t(decision === "approve" ? "broadcast.reviewApproved" : "broadcast.reviewRejected")
        : translateBroadcastError(response.error, t))
      await refreshDrafts()
    } catch {
      setDraftNotice(t("broadcast.errorReview"))
    } finally {
      setDraftBusyId(null)
    }
  }

  async function handleDraftSend(draftId: string) {
    setDraftBusyId(draftId)
    setDraftNotice(null)
    try {
      const response = await sendApprovedBroadcastDraft(draftId)
      setDraftNotice(response.success
        ? t("broadcast.sendComplete", {
          sent: response.sendResult?.sent ?? 0,
          failed: response.sendResult?.failed ?? 0,
        })
        : translateBroadcastError(response.error, t))
      await refreshDrafts()
    } catch {
      setDraftNotice(t("broadcast.errorGeneric"))
    } finally {
      setDraftBusyId(null)
    }
  }

  const readyToSend = body.trim() && selectedCount > 0 && !overLimit && !sending

  // Submission ID is managed via sessionStorage keyed by payload fingerprint.
  // When the payload changes, getOrCreateSubmissionId generates a new ID on next dialog open.
  if (!pageReady) {
    return <div className="p-6 text-sm text-gray-500">{t("broadcast.loading")}</div>
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("broadcast.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("broadcast.description")}
        </p>
      </div>

      {error && (
        <Notice variant="error" className="mb-4">{error}</Notice>
      )}
      {draftNotice && (
        <Notice variant="info" className="mb-4">{draftNotice}</Notice>
      )}

      {canPrepare && drafts.length > 0 && (
        <div className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">{t("broadcast.reviewQueue")}</h2>
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{draft.creator_name ?? t("broadcast.staffMember")}</span>
                    <span className="ms-2 text-xs text-gray-500">{t("broadcast.recipientCount", { count: draft.recipient_ids.length })}</span>
                  </div>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs">{t(DRAFT_STATUS_KEYS[draft.status])}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-gray-700">{draft.message_body}</p>
                {(draft.status === "sent" || draft.status === "failed") && (
                  <p className="mt-2 text-xs text-gray-600">{t("broadcast.draftSummary", { sent: draft.sent_count, failed: draft.failed_count })}</p>
                )}
                {draft.review_note && <p className="mt-2 text-xs text-red-600">{draft.review_note}</p>}
                {canSend && draft.status === "pending_review" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={draftBusyId === draft.id} onClick={() => handleDraftReview(draft.id, "approve")}>{t("broadcast.approve")}</Button>
                    <Button variant="outline" size="sm" disabled={draftBusyId === draft.id} onClick={() => handleDraftReview(draft.id, "reject")}>{t("broadcast.reject")}</Button>
                  </div>
                )}
                {canSend && draft.status === "approved" && (
                  <Button className="mt-3" size="sm" disabled={draftBusyId === draft.id} onClick={() => handleDraftSend(draft.id)}>
                    {draftBusyId === draft.id ? t("broadcast.sending") : t("broadcast.sendApproved")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!canPrepare && role !== "company_admin" ? (
        <Notice variant="warning">
          {t("broadcast.noPermission")}{" "}
          <Link href="/dashboard/permissions" className="font-medium underline">{t("broadcast.requestAccess")}</Link>.
        </Notice>
      ) : result ? (
        <div className="max-w-2xl">
          {result.success && !result.alreadySubmitted ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <div className="mb-2 text-lg font-semibold text-green-800">{t("broadcast.complete")}</div>
              <div className="space-y-1 text-sm text-green-700">
                <p>{t("broadcast.sentCount", { count: result.sent })}</p>
                <p>{t("broadcast.failedCount", { count: result.failed ?? 0 })}</p>
                {result.error && (
                  <p className="text-red-600">
                    {t("broadcast.errors", { error: translateBroadcastError(result.error, t) })}
                  </p>
                )}
                {result.mock && (
                  <p className="mt-1 text-xs text-amber-600">{t("broadcast.mockOnly")}</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => router.push("/dashboard/messages")}>
                  {t("broadcast.viewHistory")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBody(""); setResult(null); setError(null); setTemplateBody(null); setSubmissionId(null)
                  }}
                >
                  {t("broadcast.sendAnother")}
                </Button>
              </div>
            </div>
          ) : result.payloadMismatch ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="mb-2 text-lg font-semibold text-red-800">{t("broadcast.rejectedTitle")}</div>
              <p className="text-sm text-red-700">
                {t("broadcast.payloadChanged")}
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null); setResult(null); setSubmissionId(null)
                  }}
                >
                  {t("broadcast.tryAgain")}
                </Button>
              </div>
            </div>
          ) : result.alreadySubmitted && result.submissionStatus === "completed" ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
              <div className="mb-2 text-lg font-semibold text-blue-800">{t("broadcast.alreadySent")}</div>
              <p className="text-sm text-blue-700">
                {t("broadcast.alreadySummary", { sent: result.sent, skipped: result.skipped })}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => router.push("/dashboard/messages")}>
                  {t("broadcast.viewHistory")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBody(""); setResult(null); setError(null); setTemplateBody(null); setSubmissionId(null)
                  }}
                >
                  {t("broadcast.sendAnother")}
                </Button>
              </div>
            </div>
          ) : result.alreadySubmitted && result.submissionStatus === "processing" && result.staleProcessing ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="mb-2 text-lg font-semibold text-red-800">{t("broadcast.stuck")}</div>
              <p className="text-sm text-red-700">
                {t("broadcast.stuckDescription")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => router.push("/dashboard/messages")}>
                  {t("broadcast.viewHistory")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null); setResult(null)
                    clearSubmissionId(payloadFingerprint)
                    setSubmissionId(null)
                  }}
                >
                  {t("broadcast.startNew")}
                </Button>
              </div>
            </div>
          ) : result.alreadySubmitted && result.submissionStatus === "processing" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
              <div className="mb-2 text-lg font-semibold text-amber-800">{t("broadcast.processing")}</div>
              <p className="text-sm text-amber-700">
                {t("broadcast.processingDescription")}
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setResult(null)}
                >
                  {t("broadcast.dismiss")}
                </Button>
              </div>
            </div>
          ) : result.alreadySubmitted && result.submissionStatus === "uncertain" ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
              <div className="mb-2 text-lg font-semibold text-orange-800">{t("broadcast.uncertain")}</div>
              <p className="text-sm text-orange-700">
                {t("broadcast.uncertainDescription")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => router.push("/dashboard/messages")}>
                  {t("broadcast.viewHistory")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setResult(null)}
                >
                  {t("broadcast.dismiss")}
                </Button>
              </div>
            </div>
          ) : result.alreadySubmitted && result.submissionStatus === "failed" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="mb-2 text-lg font-semibold text-red-800">{t("broadcast.previouslyFailed")}</div>
              <p className="text-sm text-red-700">
                {t("broadcast.previouslyFailedDescription")}
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null); setResult(null); setSubmissionId(null)
                  }}
                >
                  {t("broadcast.startNew")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="mb-2 text-lg font-semibold text-red-800">{t("broadcast.failed")}</div>
              <p className="text-sm text-red-700">
                {result.error ? translateBroadcastError(result.error, t) : t("broadcast.unknownError")}
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null); setResult(null)
                  }}
                >
                  {t("broadcast.tryAgain")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recipients panel */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">
                  {t("broadcast.recipients")}
                  {!recipientsLoading && (
                    <span className="ms-2 font-normal text-gray-500">
                      ({selectedCount > 0 ? t("broadcast.selectedCount", { count: selectedCount }) : selectedCount})
                    </span>
                  )}
                  {selectedCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                      className="ms-2"
                    >
                      {t("broadcast.clear")}
                    </Button>
                  )}
                </h2>
                <span className="text-xs text-gray-500">
                  {t("broadcast.maxRecipients", { count: MAX_RECIPIENTS })}
                </span>
              </div>

              {overLimit && (
                <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">
                  {t("broadcast.overLimit", { max: MAX_RECIPIENTS })}
                </div>
              )}

              {/* Search */}
              <form onSubmit={handleSearch} className="flex gap-2 border-b px-4 py-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("broadcast.searchPlaceholder")}
                  className="flex-1 rounded border px-3 py-1.5 text-sm"
                />
                <Button
                  type="submit"
                  disabled={recipientsLoading}
                >
                  {t("broadcast.search")}
                </Button>
              </form>

              {recipientsLoading ? (
                <div className="p-6 text-center text-sm text-gray-500">{t("broadcast.loadingRecipients")}</div>
              ) : recipients.length === 0 ? (
                <EmptyState
                  icon={activeQuery ? Search : Inbox}
                  title={activeQuery ? t("broadcast.noMatches") : t("broadcast.noCustomers")}
                  description={activeQuery ? undefined : t("broadcast.importCustomers")}
                />
              ) : (
                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-start text-xs uppercase text-gray-500">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={
                              recipients.filter(
                                (r) => r.communication_status !== "opted_out" && r.communication_status !== "invalid_number",
                              ).length > 0 &&
                              recipients
                                .filter(
                                  (r) => r.communication_status !== "opted_out" && r.communication_status !== "invalid_number",
                                )
                                .every((r) => selectedIds.has(r.id))
                            }
                            onChange={toggleAll}
                            className="h-4 w-4"
                          />
                        </th>
                        <th className="px-3 py-2">{t("broadcast.name")}</th>
                        <th className="px-3 py-2">{t("broadcast.mobile")}</th>
                        <th className="px-3 py-2">{t("broadcast.policy")}</th>
                        <th className="px-3 py-2">{t("broadcast.status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {recipients.map((r) => {
                        const disabled = r.communication_status === "opted_out" || r.communication_status === "invalid_number"
                        const checked = selectedIds.has(r.id)
                        return (
                          <tr key={r.id} className={checked ? "bg-blue-50" : ""}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleId(r.id)}
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="px-3 py-2 font-medium">{r.customer_name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.mobile_no}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.policy_no}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.communication_status === "allowed"
                                    ? "bg-green-100 text-green-700"
                                    : r.communication_status === "opted_out"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {translateCommunicationStatus(r.communication_status, t)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {hasMore && (
                    <div className="border-t px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? t("broadcast.loadingMore") : t("broadcast.loadMore")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Message panel */}
          <div>
            <div className="rounded-lg border bg-card shadow-sm p-6">
              <label className="mb-2 block text-sm font-medium">{t("broadcast.message")}</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder={t("broadcast.messagePlaceholder")}
                className="mb-3 w-full rounded border px-3 py-2 text-sm font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadTemplate}
                  disabled={loading || recipientsLoading}
                >
                  {t("broadcast.loadTemplate")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setBody(""); setError(null) }}
                  disabled={!body}
                >
                  {t("broadcast.clear")}
                </Button>
              </div>
            </div>

            {/* Selected count and preview */}
            {selectedCount > 0 && body.trim() && (
              <div className="mt-4 rounded-lg border bg-card shadow-sm p-6">
                {sampleMessages.length > 0 && (
                  <p className="mb-2 text-sm font-medium">
                    {t("broadcast.previewFor", { sample: sampleMessages.length, selected: selectedCount })}
                  </p>
                )}
                {sampleMessages.map((s, i) => (
                  <div key={i} className="mb-2 rounded bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-500 font-mono">{s.mobile}</p>
                    <pre className="whitespace-pre-wrap text-sm font-mono">{s.body}</pre>
                  </div>
                ))}
                {canSend ? (
                  <Button
                    onClick={handleOpenConfirm}
                    disabled={overLimit || !readyToSend}
                    className="mt-3 w-full"
                  >
                    {overLimit
                      ? t("broadcast.maxSelected", { max: MAX_RECIPIENTS, selected: selectedCount })
                      : t("broadcast.sendTo", { count: selectedCount })}
                  </Button>
                ) : (
                  <div className="mt-3">
                    <Button
                      onClick={handleSubmitForReview}
                      disabled={!readyToSend || draftBusyId === "new"}
                      className="w-full"
                    >
                      {draftBusyId === "new" ? t("broadcast.submitting") : t("broadcast.submitReview")}
                    </Button>
                    <p className="mt-2 text-xs text-amber-600">{t("broadcast.adminOnly")}</p>
                  </div>
                )}
                {templateBody && body === templateBody && (
                  <p className="mt-2 text-xs text-green-600">{t("broadcast.usingTemplate")}</p>
                )}
              </div>
            )}

            {!body.trim() && selectedCount > 0 && (
              <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-center text-sm text-gray-500">
                {t("broadcast.writeMessage")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && canSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold">{t("broadcast.confirmTitle")}</h2>
            <p className="mb-4 text-sm text-gray-600">
              {t("broadcast.confirmDescription", { count: selectedCount })}
            </p>

            {sampleMessages.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-medium uppercase text-gray-500">{t("broadcast.sampleMessages")}</p>
                {sampleMessages.map((s, i) => (
                  <div key={i} className="rounded bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-500 font-mono">{s.mobile}</p>
                    <pre className="whitespace-pre-wrap text-sm font-mono">{s.body}</pre>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={sending || !submissionId}
              >
                {sending ? t("broadcast.sending") : t("broadcast.confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
