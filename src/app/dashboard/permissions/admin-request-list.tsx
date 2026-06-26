"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  approvePermissionRequest,
  rejectPermissionRequest,
  type CompanyPermissionRequest,
} from "./actions"
import { Button } from "@/components/ui/button"

export default function AdminRequestList({
  initialPending,
  initialReviewed,
}: {
  initialPending: CompanyPermissionRequest[]
  initialReviewed: CompanyPermissionRequest[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(initialPending)
  const [reviewed, setReviewed] = useState(initialReviewed)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  async function handleApprove(requestId: string) {
    setActionError(null)
    setActioning(requestId)
    const result = await approvePermissionRequest(
      requestId,
      reviewNotes[requestId] || undefined,
    )
    if (result.success) {
      router.refresh()
    } else {
      setActionError(result.error || "Failed to approve")
      setActioning(null)
    }
  }

  async function handleReject(requestId: string) {
    setActionError(null)
    setActioning(requestId)
    const result = await rejectPermissionRequest(
      requestId,
      reviewNotes[requestId] || undefined,
    )
    if (result.success) {
      router.refresh()
    } else {
      setActionError(result.error || "Failed to reject")
      setActioning(null)
    }
  }

  return (
    <>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Pending Requests</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Staff</th>
                  <th className="pb-2 pr-4 font-medium">Permission</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                  <th className="pb-2 pr-4 font-medium">Submitted</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{r.staff_name || "Unknown"}</td>
                    <td className="py-2 pr-4">{r.permission}</td>
                    <td className="max-w-xs truncate py-2 pr-4 text-muted-foreground" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          placeholder="Review note (optional)"
                          className="w-40 rounded border px-2 py-1 text-xs"
                          value={reviewNotes[r.id] || ""}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          disabled={actioning === r.id}
                        />
                        <div className="flex gap-1">
                          <Button
                            onClick={() => handleApprove(r.id)}
                            disabled={actioning === r.id}
                            size="sm"
                          >
                            {actioning === r.id ? "..." : "Approve"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(r.id)}
                            disabled={actioning === r.id}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {actionError && (
          <p className="mt-2 text-sm text-red-600">{actionError}</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Reviewed History</h2>
        {reviewed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviewed requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Staff</th>
                  <th className="pb-2 pr-4 font-medium">Permission</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Reviewed</th>
                  <th className="pb-2 font-medium">Review Note</th>
                </tr>
              </thead>
              <tbody>
                {reviewed.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{r.staff_name || "Unknown"}</td>
                    <td className="py-2 pr-4">{r.permission}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                      {r.reviewed_at
                        ? new Date(r.reviewed_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {r.review_note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
