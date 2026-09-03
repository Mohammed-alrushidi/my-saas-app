"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getMessageHistory,
  previewRenewal,
  confirmRenewal,
  previewBirthdays,
  confirmBirthdays,
  retryFailedMessage,
} from "./actions"
import { getCurrentRole } from "../role-actions"
import type { MessageRecord, PreviewResult, ConfirmResult } from "./actions"
import { EmptyState } from "@/components/ui/empty-state"
import { Notice } from "@/components/ui/notice"
import { Users, CalendarDays, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

type Tab = "history" | "renewal" | "birthday"
type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

const MESSAGE_TYPE_KEYS: Record<string, TranslationKey> = {
  renewal: "messages.typeRenewal",
  birthday: "messages.typeBirthday",
  broadcast: "messages.typeBroadcast",
}

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: "messages.statusPending",
  queued: "messages.statusQueued",
  sent: "messages.statusSent",
  delivered: "messages.statusDelivered",
  read: "messages.statusRead",
  failed: "messages.statusFailed",
  undelivered: "messages.statusUndelivered",
  skipped: "messages.statusSkipped",
  canceled: "messages.statusCanceled",
}

const MESSAGE_ERROR_KEYS: Record<string, TranslationKey> = {
  "Invalid message type filter": "messages.errorInvalidFilter",
  "Invalid message status filter": "messages.errorInvalidFilter",
  "Invalid delivery status filter": "messages.errorInvalidFilter",
  "Failed to load message history": "messages.errorLoad",
  "Invalid message identifier": "messages.errorInvalidId",
  "No company assigned": "messages.errorNoCompany",
  "Account is inactive": "messages.errorInactive",
  "Only admins can retry messages": "messages.errorAdminOnly",
  "Only admins can send messages": "messages.errorAdminOnly",
  "Message not found": "messages.errorNotFound",
  "Only failed or undelivered messages can be retried": "messages.errorNotRetryable",
  "Failed to inspect retry history": "messages.errorRetryHistory",
  "Maximum retry attempts reached": "messages.errorMaxRetries",
  "Retry backoff is still active": "messages.errorBackoff",
  "Recipient is no longer eligible for messaging": "messages.errorIneligible",
  "Recipient has opted out": "messages.errorOptedOut",
  "Messaging provider is not configured": "messages.errorProvider",
  "This retry attempt was already claimed": "messages.errorAlreadyClaimed",
  "Failed to claim retry": "messages.errorClaim",
  "Retry outcome is uncertain; check message history before trying again": "messages.errorUncertain",
  "Invalid reminder day": "messages.errorInvalidDay",
  "No renewal template found": "messages.errorNoRenewalTemplate",
  "No birthday template found": "messages.errorNoBirthdayTemplate",
  "Manual birthday sending is disabled while automation is active": "messages.errorAutomationActive",
}

function translateMessageType(type: string, t: Translate): string {
  const key = MESSAGE_TYPE_KEYS[type]
  return key ? t(key) : type
}

function translateStatus(status: string, t: Translate): string {
  const key = STATUS_KEYS[status]
  return key ? t(key) : status
}

function translateMessageError(message: string | undefined, t: Translate): string {
  if (!message) return t("messages.errorGeneric")
  return t(MESSAGE_ERROR_KEYS[message] ?? "messages.errorGeneric")
}

export default function MessagesPage() {
  const { t } = useLanguage()
  const [tab, setTab] = useState<Tab>("history")
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    getCurrentRole().then((role) => setIsAdmin(role === "company_admin"))
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: "history", label: t("messages.tabHistory") },
    ...(isAdmin ? ([
      { key: "renewal" as const, label: t("messages.tabRenewal") },
      { key: "birthday" as const, label: t("messages.tabBirthday") },
    ] as { key: Tab; label: string }[]) : []),
  ]

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("messages.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("messages.description")}</p>
      </div>

      <div className="mb-6 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "history" && <HistorySection isAdmin={isAdmin} />}
      {tab === "renewal" && <RenewalSection />}
      {tab === "birthday" && <BirthdaySection />}
    </div>
  )
}

// ─── History ────────────────────────────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
    case "queued":
      return "bg-amber-100 text-amber-700"
    case "sent":
      return "bg-green-100 text-green-700"
    case "delivered":
      return "bg-blue-100 text-blue-700"
    case "read":
      return "bg-purple-100 text-purple-700"
    case "failed":
    case "undelivered":
      return "bg-red-100 text-red-700"
    case "skipped":
    case "canceled":
      return "bg-gray-100 text-gray-600"
    default:
      return "bg-gray-100 text-gray-600"
  }
}

function HistorySection({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useLanguage()
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [deliveryFilter, setDeliveryFilter] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPage(1)
    try {
      const result = await getMessageHistory(typeFilter, statusFilter, 1, deliveryFilter)
      if (result.error) {
        setError(translateMessageError(result.error, t))
        setMessages([])
        setHasMore(false)
      } else {
        setMessages(result.messages)
        setHasMore(result.hasMore)
      }
    } catch {
      setError(t("messages.errorLoad"))
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter, deliveryFilter, t])

  useEffect(() => {
    let active = true

    getMessageHistory(typeFilter, statusFilter, 1, deliveryFilter)
      .then((result) => {
        if (!active) return
        if (result.error) {
          setError(translateMessageError(result.error, t))
          setMessages([])
          setHasMore(false)
        } else {
          setMessages(result.messages)
          setHasMore(result.hasMore)
        }
        setPage(1)
      })
      .catch(() => {
        if (!active) return
        setError(t("messages.errorLoad"))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [typeFilter, statusFilter, deliveryFilter, t])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await getMessageHistory(typeFilter, statusFilter, nextPage, deliveryFilter)
      if (result.error) {
        setError(translateMessageError(result.error, t))
      } else {
        setMessages((prev) => [...prev, ...result.messages])
        setHasMore(result.hasMore)
        setPage(nextPage)
      }
    } catch {
      setError(t("messages.errorLoadMore"))
    } finally {
      setLoadingMore(false)
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  async function retryMessage(id: string) {
    setRetryingId(id)
    setRetryNotice(null)
    try {
      const result = await retryFailedMessage(id)
      setRetryNotice(result.success
        ? t(result.mock ? "messages.retryAcceptedMock" : "messages.retryAccepted", { attempt: result.attempt ?? 1 })
        : translateMessageError(result.error, t))
      await fetch()
    } catch {
      setRetryNotice(t("messages.errorRetry"))
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div>
      {retryNotice && <Notice variant="info" className="mb-4">{retryNotice}</Notice>}
      <div className="mb-4 flex flex-wrap gap-4">
        <select
          value={typeFilter}
          onChange={(e) => {
            setLoading(true)
            setError(null)
            setTypeFilter(e.target.value)
          }}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="all">{t("messages.allTypes")}</option>
          <option value="renewal">{t("messages.typeRenewal")}</option>
          <option value="birthday">{t("messages.typeBirthday")}</option>
          <option value="broadcast">{t("messages.typeBroadcast")}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setLoading(true)
            setError(null)
            setStatusFilter(e.target.value)
          }}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="all">{t("messages.allStatus")}</option>
          <option value="sent">{t("messages.providerAccepted")}</option>
          <option value="failed">{t("messages.dispatchFailed")}</option>
          <option value="skipped">{t("messages.statusSkipped")}</option>
          <option value="pending">{t("messages.statusPending")}</option>
          <option value="canceled">{t("messages.statusCanceled")}</option>
        </select>
        <select
          value={deliveryFilter}
          onChange={(e) => {
            setLoading(true)
            setError(null)
            setDeliveryFilter(e.target.value)
          }}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="all">{t("messages.allDelivery")}</option>
          <option value="queued">{t("messages.statusQueued")}</option>
          <option value="sent">{t("messages.statusSent")}</option>
          <option value="delivered">{t("messages.statusDelivered")}</option>
          <option value="read">{t("messages.statusRead")}</option>
          <option value="undelivered">{t("messages.statusUndelivered")}</option>
          <option value="failed">{t("messages.statusFailed")}</option>
          <option value="canceled">{t("messages.statusCanceled")}</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 space-y-3">
          <Notice variant="error">{error}</Notice>
          <Button variant="outline" onClick={fetch} disabled={loading}>
            {t("messages.retry")}
          </Button>
        </div>
      )}

      {!error && (loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="mr-2 h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          {t("messages.loading")}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={t("messages.empty")}
          description={t("messages.emptyDescription")}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-start">
                  <th className="px-4 py-3 font-medium">{t("messages.date")}</th>
                  <th className="px-4 py-3 font-medium">{t("messages.type")}</th>
                  <th className="px-4 py-3 font-medium">{t("messages.customer")}</th>
                  <th className="px-4 py-3 font-medium">{t("messages.mobile")}</th>
                  <th className="px-4 py-3 font-medium">{t("messages.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("messages.delivery")}</th>
                  <th className="w-10 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <HistoryRow
                    key={m.id}
                    message={m}
                    expanded={expandedId === m.id}
                    onToggle={() => toggleExpand(m.id)}
                    canRetry={isAdmin && (m.status === "failed" || m.delivery_status === "failed" || m.delivery_status === "undelivered")}
                    retrying={retryingId === m.id}
                    onRetry={() => retryMessage(m.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? t("messages.loadingMore") : t("messages.loadMore")}
              </Button>
            </div>
          )}
        </>
      ))}
    </div>
  )
}

function HistoryRow({
  message: m,
  expanded,
  onToggle,
  canRetry,
  retrying,
  onRetry,
}: {
  message: MessageRecord
  expanded: boolean
  onToggle: () => void
  canRetry: boolean
  retrying: boolean
  onRetry: () => void
}) {
  const { locale, t } = useLanguage()
  const localeTag = locale === "ar" ? "ar-OM" : "en-GB"

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
      >
        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
          {new Date(m.created_at).toLocaleString(localeTag)}
        </td>
        <td className="px-4 py-3">{translateMessageType(m.message_type, t)}</td>
        <td className="px-4 py-3 font-medium">{m.customer_name ?? "-"}</td>
        <td className="px-4 py-3 font-mono text-xs">{m.recipient_mobile}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(m.status)}`}>
            {translateStatus(m.status, t)}
          </span>
        </td>
        <td className="px-4 py-3">
          {m.delivery_status ? (
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(m.delivery_status)}`}>
              {translateStatus(m.delivery_status, t)}
            </span>
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-400">
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="border-b bg-gray-50 px-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.body")}</span>
                <pre className="whitespace-pre-wrap rounded bg-white border p-3 text-sm font-mono">{m.message_body}</pre>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.providerId")}</span>
                <p className="font-mono text-xs text-gray-700 break-all">{m.provider_message_id ?? "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.templateUsed")}</span>
                <p className="text-sm text-gray-700">{m.template_used ?? "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.sentAt")}</span>
                <p className="text-sm text-gray-700">{m.sent_at ? new Date(m.sent_at).toLocaleString(localeTag) : "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.reminderStage")}</span>
                <p className="text-sm text-gray-700">{m.reminder_stage != null ? t("messages.days", { count: m.reminder_stage }) : "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.estimatedCost")}</span>
                <p className="text-sm text-gray-700">{m.estimated_cost_baisa == null ? "-" : `${(m.estimated_cost_baisa / 1000).toFixed(3)} ${m.cost_currency ?? "OMR"}`}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.actualCost")}</span>
                <p className="text-sm text-gray-700">{m.actual_cost_baisa == null ? "-" : `${(m.actual_cost_baisa / 1000).toFixed(3)} ${m.cost_currency ?? "OMR"}`}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{t("messages.failureReason")}</span>
                <p className="text-sm text-red-600">{m.failure_reason ?? "-"}</p>
              </div>
              {canRetry && (
                <div className="sm:col-span-2">
                  <Button
                    variant="outline"
                    disabled={retrying}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRetry()
                    }}
                  >
                    {retrying ? t("messages.retrying") : t("messages.retryMessage")}
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Renewal ────────────────────────────────────────────────

function RenewalSection() {
  const { t } = useLanguage()
  const DAY_OPTIONS = [7, 14, 30]
  const [days, setDays] = useState(30)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handlePreview() {
    setLoading(true)
    setPreview(null)
    setResult(null)
    setActionError(null)
    try {
      setPreview(await previewRenewal(days))
    } catch {
      setActionError(t("messages.errorPreview"))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setSending(true)
    setActionError(null)
    try {
      setResult(await confirmRenewal(days))
      setPreview(null)
    } catch {
      setActionError(t("messages.errorSendUncertain"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        {t("messages.renewalDescription")}
      </p>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium">{t("messages.reminderDay")}</label>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => { setDays(d); setPreview(null); setResult(null) }}
            className={`rounded px-4 py-2 text-sm ${
              days === d ? "bg-blue-600 text-white" : "border hover:bg-gray-100"
            }`}
          >
            {t("messages.days", { count: d })}
          </button>
        ))}
      </div>

      <Button
        onClick={handlePreview}
        disabled={loading}
      >
        {loading ? t("messages.previewing") : t("messages.preview")}
      </Button>

      {preview && (
        <div className="mt-4 rounded-lg border bg-card shadow-sm p-6">
          {preview.error ? (
            <p className="text-sm text-red-600">{translateMessageError(preview.error, t)}</p>
          ) : preview.count === 0 ? (
            <EmptyState icon={Users} title={t("messages.noEligible")} description={t("messages.noEligibleDay")} />
          ) : (
            <>
              <p className="mb-3 text-sm font-medium">{t("messages.renewalRecipients", { count: preview.count })}</p>
              {preview.sample.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500">{t("messages.sampleMessages")}</p>
                  {preview.sample.map((s, i) => (
                    <div key={i} className="rounded bg-gray-50 p-3">
                      <p className="text-xs text-gray-500 font-mono mb-1">{s.mobile}</p>
                      <pre className="whitespace-pre-wrap text-sm font-mono">{s.body}</pre>
                    </div>
                  ))}
                </div>
              )}
              <Button
                onClick={handleConfirm}
                disabled={sending}
              >
                {sending ? t("messages.sending") : t("messages.confirmSend", { count: preview.count })}
              </Button>
            </>
          )}
        </div>
      )}

      {actionError && (
        <Notice variant="error" className="mt-4">
          {actionError}
        </Notice>
      )}

      {result && (
        <Notice variant={result.success ? "success" : "error"} className="mt-4">
          {result.success
            ? t("messages.renewalResult", {
              sent: result.sent,
              failed: result.failed ?? 0,
              skipped: result.skipped,
            })
            : translateMessageError(result.error, t)}
        </Notice>
      )}
    </div>
  )
}

// ─── Birthday ───────────────────────────────────────────────

function BirthdaySection() {
  const { t } = useLanguage()
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handlePreview() {
    setLoading(true)
    setPreview(null)
    setResult(null)
    setActionError(null)
    try {
      setPreview(await previewBirthdays())
    } catch {
      setActionError(t("messages.errorPreview"))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setSending(true)
    setActionError(null)
    try {
      setResult(await confirmBirthdays())
      setPreview(null)
    } catch {
      setActionError(t("messages.errorSendUncertain"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        {t("messages.birthdayDescription")}
      </p>

      <Button
        onClick={handlePreview}
        disabled={loading}
      >
        {loading ? t("messages.previewing") : t("messages.preview")}
      </Button>

      {preview && (
        <div className="mt-4 rounded-lg border bg-card shadow-sm p-6">
          {preview.error ? (
            <p className="text-sm text-red-600">{translateMessageError(preview.error, t)}</p>
          ) : preview.count === 0 ? (
            <EmptyState icon={CalendarDays} title={t("messages.noBirthdays")} />
          ) : (
            <>
              <p className="mb-3 text-sm font-medium">{t("messages.birthdayRecipients", { count: preview.count })}</p>
              {preview.sample.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500">{t("messages.sampleMessages")}</p>
                  {preview.sample.map((s, i) => (
                    <div key={i} className="rounded bg-gray-50 p-3">
                      <p className="text-xs text-gray-500 font-mono mb-1">{s.mobile}</p>
                      <pre className="whitespace-pre-wrap text-sm font-mono">{s.body}</pre>
                    </div>
                  ))}
                </div>
              )}
              <Button
                onClick={handleConfirm}
                disabled={sending}
              >
                {sending ? t("messages.sending") : t("messages.confirmSend", { count: preview.count })}
              </Button>
            </>
          )}
        </div>
      )}

      {actionError && (
        <Notice variant="error" className="mt-4">
          {actionError}
        </Notice>
      )}

      {result && (
        <Notice variant={result.success ? "success" : "error"} className="mt-4">
          {result.success
            ? t("messages.birthdayResult", { sent: result.sent, failed: result.failed ?? 0 })
            : translateMessageError(result.error, t)}
        </Notice>
      )}
    </div>
  )
}


