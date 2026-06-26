"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getMessageHistory,
  previewRenewal,
  confirmRenewal,
  previewBirthdays,
  confirmBirthdays,
} from "./actions"
import { getCurrentRole } from "../role-actions"
import type { MessageRecord, PreviewResult, ConfirmResult } from "./actions"
import { Button } from "@/components/ui/button"

type Tab = "history" | "renewal" | "birthday"

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("history")
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    getCurrentRole().then((role) => setIsAdmin(role === "company_admin"))
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: "history", label: "History" },
    ...(isAdmin ? ([
      { key: "renewal" as const, label: "Send Renewal" },
      { key: "birthday" as const, label: "Send Birthday" },
    ] as { key: Tab; label: string }[]) : []),
  ]

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold">Messages</h1>
      <p className="mb-6 text-sm text-muted-foreground">Preview and send messages to customers.</p>

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

      {tab === "history" && <HistorySection />}
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
      return "bg-gray-100 text-gray-600"
    default:
      return "bg-gray-100 text-gray-600"
  }
}

const HISTORY_PAGE_SIZE = 50

function HistorySection() {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setPage(1)
    const result = await getMessageHistory(typeFilter, statusFilter, 1)
    setMessages(result.messages)
    setHasMore(result.hasMore)
    setLoading(false)
  }, [typeFilter, statusFilter])

  useEffect(() => { fetch() }, [fetch])

  async function loadMore() {
    setLoadingMore(true)
    const nextPage = page + 1
    const result = await getMessageHistory(typeFilter, statusFilter, nextPage)
    setMessages((prev) => [...prev, ...result.messages])
    setHasMore(result.hasMore)
    setPage(nextPage)
    setLoadingMore(false)
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="all">All Types</option>
          <option value="renewal">Renewal</option>
          <option value="birthday">Birthday</option>
          <option value="broadcast">Broadcast</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="delivered">Delivered</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <svg className="mr-2 h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Loading messages...
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5Z" />
          </svg>
          <p className="text-sm text-gray-500">No messages found.</p>
          <p className="mt-1 text-xs text-gray-400">
            Messages will appear here after you send your first broadcast, renewal, or birthday greeting.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Mobile</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
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
                {loadingMore ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function HistoryRow({ message: m, expanded, onToggle }: { message: MessageRecord; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
      >
        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
          {new Date(m.created_at).toLocaleString()}
        </td>
        <td className="px-4 py-3 capitalize">{m.message_type}</td>
        <td className="px-4 py-3 font-medium">{m.customer_name ?? "-"}</td>
        <td className="px-4 py-3 font-mono text-xs">{m.recipient_mobile}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(m.status)}`}>
            {m.status}
          </span>
        </td>
        <td className="px-4 py-3">
          {m.delivery_status ? (
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(m.delivery_status)}`}>
              {m.delivery_status}
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
                <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">Message Body</span>
                <pre className="whitespace-pre-wrap rounded bg-white border p-3 text-sm font-mono">{m.message_body}</pre>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">Provider Message ID</span>
                <p className="font-mono text-xs text-gray-700 break-all">{m.provider_message_id ?? "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">Template Used</span>
                <p className="text-sm text-gray-700">{m.template_used ?? "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">Sent At</span>
                <p className="text-sm text-gray-700">{m.sent_at ? new Date(m.sent_at).toLocaleString() : "-"}</p>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">Reminder Stage</span>
                <p className="text-sm text-gray-700">{m.reminder_stage != null ? `${m.reminder_stage} days` : "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-500 uppercase tracking-wider">Failure Reason</span>
                <p className="text-sm text-red-600">{m.failure_reason ?? "-"}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Renewal ────────────────────────────────────────────────

function RenewalSection() {
  const DAY_OPTIONS = [7, 14, 30]
  const [days, setDays] = useState(30)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<ConfirmResult | null>(null)

  async function handlePreview() {
    setLoading(true)
    setPreview(null)
    setResult(null)
    const res = await previewRenewal(days)
    setPreview(res)
    setLoading(false)
  }

  async function handleConfirm() {
    setSending(true)
    const res = await confirmRenewal(days)
    setResult(res)
    setPreview(null)
    setSending(false)
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Select a reminder day to see eligible customers and send renewal reminders.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium">Reminder Day:</label>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => { setDays(d); setPreview(null); setResult(null) }}
            className={`rounded px-4 py-2 text-sm ${
              days === d ? "bg-blue-600 text-white" : "border hover:bg-gray-100"
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      <Button
        onClick={handlePreview}
        disabled={loading}
      >
        {loading ? "Previewing..." : "Preview"}
      </Button>

      {preview && (
        <div className="mt-4 rounded-lg border bg-card shadow-sm p-6">
          {preview.error ? (
            <p className="text-sm text-red-600">{preview.error}</p>
          ) : preview.count === 0 ? (
            <p className="text-sm text-gray-500">No eligible customers for this reminder day.</p>
          ) : (
            <>
              <p className="mb-3 text-sm font-medium">{preview.count} customer(s) will receive a reminder.</p>
              {preview.sample.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500">Sample messages:</p>
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
                {sending ? "Sending..." : `Confirm Send (${preview.count})`}
              </Button>
            </>
          )}
        </div>
      )}

      {result && (
        <div className={`mt-4 rounded-md px-4 py-3 text-sm ${
          result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {result.success
            ? `${result.sent} renewal message(s) sent. ${result.skipped} skipped (already sent).`
            : result.error}
        </div>
      )}
    </div>
  )
}

// ─── Birthday ───────────────────────────────────────────────

function BirthdaySection() {
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<ConfirmResult | null>(null)

  async function handlePreview() {
    setLoading(true)
    setPreview(null)
    setResult(null)
    const res = await previewBirthdays()
    setPreview(res)
    setLoading(false)
  }

  async function handleConfirm() {
    setSending(true)
    const res = await confirmBirthdays()
    setResult(res)
    setPreview(null)
    setSending(false)
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Send birthday greetings to customers celebrating today.
      </p>

      <Button
        onClick={handlePreview}
        disabled={loading}
      >
        {loading ? "Previewing..." : "Preview"}
      </Button>

      {preview && (
        <div className="mt-4 rounded-lg border bg-card shadow-sm p-6">
          {preview.error ? (
            <p className="text-sm text-red-600">{preview.error}</p>
          ) : preview.count === 0 ? (
            <p className="text-sm text-gray-500">No birthdays today.</p>
          ) : (
            <>
              <p className="mb-3 text-sm font-medium">{preview.count} customer(s) will receive a birthday greeting.</p>
              {preview.sample.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs text-gray-500">Sample messages:</p>
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
                {sending ? "Sending..." : `Confirm Send (${preview.count})`}
              </Button>
            </>
          )}
        </div>
      )}

      {result && (
        <div className={`mt-4 rounded-md px-4 py-3 text-sm ${
          result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}>
          {result.success ? `${result.sent} birthday message(s) sent.` : result.error}
        </div>
      )}
    </div>
  )
}


