"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { loadBroadcastTemplate, getBroadcastRecipientsPaginated, confirmBroadcastSelected } from "./actions"
import { getDashboardCapabilities } from "../role-actions"
import type { BroadcastRecipient, ConfirmResult } from "./actions"
import { Button } from "@/components/ui/button"

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
  const [pageReady, setPageReady] = useState(false)
  const [canPrepare, setCanPrepare] = useState(false)
  const [canSend, setCanSend] = useState(false)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    getDashboardCapabilities().then((caps) => {
      if (!caps) {
        setPageReady(true)
        setRecipientsLoading(false)
        return
      }
      setCanPrepare(caps.canPrepareBroadcast)
      setCanSend(caps.canSendBroadcast)
      setRole(caps.role)
      setPageReady(true)

      if (caps.canPrepareBroadcast) {
        fetchRecipients("", 1, false)
      } else {
        setRecipientsLoading(false)
      }
    })
  }, [])

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
      body: body.replace(/\{\{customer_name\}\}/g, r.customer_name).replace(/\{\{company_name\}\}/g, ""),
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
    if (!canSend) return
    if (selectedCount === 0 || overLimit) return
    setSending(true)
    setError(null)
    setShowConfirm(false)
    const res = await confirmBroadcastSelected(body, Array.from(selectedIds))
    setResult(res)
    setSending(false)
  }

  const readyToSend = body.trim() && selectedCount > 0 && !overLimit && !sending

  if (!pageReady) {
    return <div className="p-6 text-gray-500">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Broadcast Message</h1>
        <p className="text-sm text-muted-foreground">
          Select recipients and compose a message. Use {"{{customer_name}}"} and {"{{company_name}}"} variables.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!canPrepare && role !== "company_admin" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You don&apos;t have permission to prepare broadcasts.{" "}
          <Link href="/dashboard/permissions" className="underline font-medium">Request access</Link>.
        </div>
      ) : result ? (
        <div className="max-w-2xl">
          {result.success ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <div className="mb-2 text-lg font-semibold text-green-800">Broadcast complete</div>
              <div className="space-y-1 text-sm text-green-700">
                <p>{result.sent} message(s) sent successfully.</p>
                {result.error && <p className="text-red-600">Errors: {result.error}</p>}
              </div>
              <div className="mt-4 flex gap-3">
                <Button onClick={() => router.push("/dashboard/messages")}>
                  View history
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBody(""); setResult(null); setError(null); setTemplateBody(null)
                  }}
                >
                  Send another
                </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds(new Set())}
                      className="ml-2"
                    >
                      Clear
                    </Button>
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
                <Button
                  type="submit"
                  disabled={recipientsLoading}
                >
                  Search
                </Button>
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
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? "Loading..." : "Load More"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Message panel */}
          <div>
            <div className="rounded-lg border p-6">
              <label className="mb-2 block text-sm font-medium">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Type your broadcast message here..."
                className="mb-3 w-full rounded border px-3 py-2 text-sm font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadTemplate}
                  disabled={loading || recipientsLoading}
                >
                  Load Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setBody(""); setError(null) }}
                  disabled={!body}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Selected count and preview */}
            {selectedCount > 0 && body.trim() && (
              <div className="mt-4 rounded-lg border bg-white p-6">
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
                {canSend ? (
                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={overLimit || !readyToSend}
                    className="mt-3 w-full"
                  >
                    {overLimit
                      ? `Max ${MAX_RECIPIENTS} recipients (${selectedCount} selected)`
                      : `Send to ${selectedCount} recipient${selectedCount !== 1 ? "s" : ""}`}
                  </Button>
                ) : (
                  <p className="mt-3 text-xs text-amber-600">
                    Only company admins can send broadcast messages. You can prepare the broadcast, but an admin must send it.
                  </p>
                )}
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
      {showConfirm && canSend && (
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
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={sending}
              >
                {sending ? "Sending..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}