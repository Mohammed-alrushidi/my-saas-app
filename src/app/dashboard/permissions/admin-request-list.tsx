"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  approvePermissionRequest,
  rejectPermissionRequest,
  type CompanyPermissionRequest,
} from "./actions"
import { EmptyState } from "@/components/ui/empty-state"
import { Inbox, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"

function permissionKey(permission: string) {
  if (permission === "templates:edit") return "permission.templates" as const
  if (permission === "reminder_settings:edit") return "permission.reminders" as const
  if (permission === "broadcast:create") return "permission.broadcast" as const
  return "permission.birthdaySend" as const
}

export default function AdminRequestList({
  initialPending,
  initialReviewed,
}: {
  initialPending: CompanyPermissionRequest[]
  initialReviewed: CompanyPermissionRequest[]
}) {
  const { locale, t } = useLanguage()
  const router = useRouter()
  const pending = initialPending
  const reviewed = initialReviewed
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
      window.dispatchEvent(new Event("permission-requests-updated"))
      router.refresh()
    } else {
      setActionError(result.error || t("permissions.approveFailed"))
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
      window.dispatchEvent(new Event("permission-requests-updated"))
      router.refresh()
    } else {
      setActionError(result.error || t("permissions.rejectFailed"))
      setActioning(null)
    }
  }

  return (
    <>
      <section>
        <h2 className="mb-4 text-lg font-semibold">{t("permissions.pending")}</h2>
        {pending.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState icon={Inbox} title={t("permissions.noPending")} />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("permissions.staff")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.permission")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.reasonLabel")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.submittedAt")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">{r.staff_name || t("permissions.unknown")}</td>
                    <td className="px-4 py-3">{t(permissionKey(r.permission))}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted-foreground" title={r.reason}>
                      {r.reason}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <input
                          type="text"
                          placeholder={t("permissions.reviewPlaceholder")}
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
                            {actioning === r.id ? "..." : t("permissions.approve")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(r.id)}
                            disabled={actioning === r.id}
                          >
                            {t("permissions.reject")}
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
        <h2 className="mb-4 text-lg font-semibold">{t("permissions.reviewedHistory")}</h2>
        {reviewed.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState icon={Clock} title={t("permissions.noReviewed")} />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("permissions.staff")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.permission")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.reviewedAt")}</th>
                  <th className="px-4 py-3 font-medium">{t("permissions.reviewNote")}</th>
                </tr>
              </thead>
              <tbody>
                {reviewed.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">{r.staff_name || t("permissions.unknown")}</td>
                    <td className="px-4 py-3">{t(permissionKey(r.permission))}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {r.status === "approved" ? t("permissions.approved") : t("permissions.rejected")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {r.reviewed_at
                        ? new Date(r.reviewed_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
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
