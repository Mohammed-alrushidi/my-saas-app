"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { loadBroadcastTemplate, getBroadcastRecipientsPaginated, confirmBroadcastSelected } from "./actions"
import type { BroadcastRecipient, ConfirmResult } from "./actions"

const MAX_RECIPIENTS = 50

export default function BroadcastPage() {
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

  async function fetchRecipients(q: string, pageNum: number, append: boolean) {
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
      setError("Failed to load recipients")
    } finally {
      if (append) {
        setLoadingMore(false)
      } else {
        setRecipientsLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchRecipients("", 1, false)
  }, [])

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

  function renderTemplate(body: string, name: string, company: string): string {
    return body.replace(/\{\{customer_name\}\}/g, name).replace(/\{\{company_name\}\}/g, company)
  }

  const sampleMessages = recipients
    .filter((r) => selectedIds.has(r.id))
    .slice(0, 3)
    .map((r) => ({
      mobile: r.mobile_no,
      body: renderTemplate(body, r.customer_name, ""),
    }))

  async function handleLoadTemplate() {
    setError(null)
    const res = await loadBroadcastTemplate()
    if (res.error) {
      setError(res.error)
    } else if (res.body) {
      setBody(res.body)
      setTemplateBody(res.body)
    } else {
      setError("No broadcast template found. Save one in Message Templates first.")
    }
  }

  async function handleConfirm() {
    if (selectedCount === 0 || overLimit) return
    setSending(true)
    setError(null)
    setShowConfirm(false)
    const res = await confirmBroadcastSelected(body, Array.from(selectedIds))
    setResult(res)
    setSending(false)
  }

  const canSend = body.trim() && selectedCount > 0 && !overLimit && !sending

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Broadcast Message</h1>
        <p className="text-sm text-gray-500">
          Select recipients and compose a message. Use {"{{customer_name}}"} and {"{{company_name}}"} variables.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {result ? (
        <div className="max-w-2xl">
          {result.success ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <div className="mb-2 text-lg font-semibold text-green-800">Broadcast complete</div>
              <div className="space-y-1 text-sm text-green-700">
                <p>{result.sent} message(s) sent successfully.</p>
                {result.error && <p className="text-red-600">Errors: {result.error}</p>}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => router.push("/dashboard/messages")}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                >
                  View history
                </button>
                <button
                  onClick={() => {
                    setBody(""); setResult(null); setError(null); setTemplateBody(null)
                  }}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Send another
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="mb-2 text-lg font-semibold text-red-800">Broadcast failed</div>
              <p className="text-sm text-red-700">{result.error ?? "Unknown error"}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recipients panel */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">
                  Recipients
                  {!recipientsLoading && (
                    <span className="ml-2 font-normal text-gray-500">
                      ({selectedCount}{selectedCount > 0 ? ` selected` : ""})
                    </span>
                  )}
                  {selectedCount > 0 && (
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="ml-2 text-xs text-red-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </h2>
                <span className="text-xs text-gray-500">
                  Max {MAX_RECIPIENTS} recipients
                </span>
              </div>

              {overLimit && (
                <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">
                  Maximum {MAX_RECIPIENTS} recipients allowed. Deselect some to continue.
                </div>
              )}

              {/* Search */}
              <form onSubmit={handleSearch} className="flex gap-2 border-b px-4 py-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, mobile, or policy..."
                  className="flex-1 rounded border px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={recipientsLoading}
                  className="rounded-md bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  Search
                </button>
              </form>

              {recipientsLoading ? (
                <div className="p-6 text-center text-sm text-gray-500">Loading recipients...</div>
              ) : recipients.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  {activeQuery
                    ? "No customers match your search."
                    : "No customers found. Import customers first."}
                </div>
              ) : (
                <div className="max-h-[400px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
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
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Mobile</th>
                        <th className="px-3 py-2">Policy</th>
                        <th className="px-3 py-2">Status</th>
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
                                {r.communication_status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {hasMore && (
                    <div className="border-t px-4 py-3 text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="rounded-md border px-6 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
                      >
                        {loadingMore ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Message panel */}
          <div>
            <div className="rounded-lg border p-4">
              <label className="mb-2 block text-sm font-medium">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Type your broadcast message here..."
                className="mb-3 w-full rounded border px-3 py-2 text-sm font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleLoadTemplate}
                  disabled={loading || recipientsLoading}
                  className="rounded border px-3 py-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                >
                  Load Template
                </button>
                <button
                  onClick={() => { setBody(""); setError(null) }}
                  disabled={!body}
                  className="rounded border px-3 py-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Selected count and preview */}
            {selectedCount > 0 && body.trim() && (
              <div className="mt-4 rounded-lg border bg-white p-4">
                {sampleMessages.length > 0 && (
                  <p className="mb-2 text-sm font-medium">
                    Preview for {sampleMessages.length} of {selectedCount} selected
                  </p>
                )}
                {sampleMessages.map((s, i) => (
                  <div key={i} className="mb-2 rounded bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-500 font-mono">{s.mobile}</p>
                    <pre className="whitespace-pre-wrap text-sm font-mono">{s.body}</pre>
                  </div>
                ))}
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={overLimit || !canSend}
                  className="mt-3 w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {overLimit
                    ? `Max ${MAX_RECIPIENTS} recipients (${selectedCount} selected)`
                    : `Send to ${selectedCount} recipient${selectedCount !== 1 ? "s" : ""}`}
                </button>
                {templateBody && body === templateBody && (
                  <p className="mt-2 text-xs text-green-600">Using saved template</p>
                )}
              </div>
            )}

            {!body.trim() && selectedCount > 0 && (
              <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-center text-sm text-gray-500">
                Write a message or load a template to see the preview.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold">Confirm Broadcast</h2>
            <p className="mb-4 text-sm text-gray-600">
              This will send to <strong>{selectedCount}</strong> selected recipient{selectedCount !== 1 ? "s" : ""}.
            </p>

            {sampleMessages.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Sample messages</p>
                {sampleMessages.map((s, i) => (
                  <div key={i} className="rounded bg-gray-50 p-3">
                    <p className="mb-1 text-xs text-gray-500 font-mono">{s.mobile}</p>
                    <pre className="whitespace-pre-wrap text-sm font-mono">{s.body}</pre>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                {sending ? "Sending..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
