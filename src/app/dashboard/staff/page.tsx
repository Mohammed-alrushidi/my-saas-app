"use client"

import { useState, useEffect, useCallback } from "react"
import { listStaff, inviteStaff, deactivateStaff, activateStaff, getCompanyStaffGrants } from "./actions"
import type { StaffMember } from "./actions"
import StaffPermissionGrants from "./staff-permission-grants"
import type { StaffPermissionGrant } from "./staff-permission-grants"
import { Notice } from "@/components/ui/notice"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"

type PendingStaffAction = {
  type: "deactivate" | "activate"
  userId: string
  name: string
}

export default function StaffPage() {
  const { locale, t } = useLanguage()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [grantsByStaff, setGrantsByStaff] = useState<Record<string, StaffPermissionGrant[]>>({})
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [inviting, setInviting] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingStaffAction | null>(null)
  const [acting, setActing] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const refreshData = useCallback(async () => {
    setLoading(true)
    try {
      const [staffData, grantsData] = await Promise.all([listStaff(), getCompanyStaffGrants()])
      setStaff(staffData)
      const map: Record<string, StaffPermissionGrant[]> = {}
      for (const s of grantsData) {
        map[s.id] = s.grants
      }
      setGrantsByStaff(map)
    } catch {
      setNotification({ type: "error", message: t("staff.loadFailed") })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { refreshData() }, [refreshData])

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return
    setInviting(true)
    try {
      const result = await inviteStaff(email, fullName)
      if (result.success) {
        setEmail("")
        setFullName("")
        setNotification({ type: "success", message: t("staff.inviteSent") })
        refreshData()
      } else {
        setNotification({ type: "error", message: result.error ?? t("staff.inviteFailed") })
      }
    } catch {
      setNotification({ type: "error", message: t("staff.genericFailed") })
    } finally {
      setInviting(false)
    }
  }

  function requestDeactivate(userId: string, name: string) {
    setPendingAction({ type: "deactivate", userId, name })
  }

  function requestActivate(userId: string, name: string) {
    setPendingAction({ type: "activate", userId, name })
  }

  async function handlePendingConfirm() {
    if (!pendingAction) return
    const { type, userId } = pendingAction
    setActing(true)
    try {
      const result = type === "deactivate" ? await deactivateStaff(userId) : await activateStaff(userId)
      if (result.success) {
        setNotification({ type: "success", message: type === "deactivate" ? t("staff.deactivated") : t("staff.reactivated") })
        setPendingAction(null)
        refreshData()
      } else {
        setNotification({
          type: "error",
          message: result.error ?? (type === "deactivate" ? t("staff.deactivateFailed") : t("staff.reactivateFailed")),
        })
      }
    } catch {
      setNotification({ type: "error", message: t("staff.genericFailed") })
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("staff.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("staff.description")}</p>
      </div>

      {notification && (
        <Notice
          variant={notification.type === "success" ? "success" : "error"}
          dismissible
          onDismiss={() => setNotification(null)}
          className="mb-4"
        >
          {notification.message}
        </Notice>
      )}

      <div className="mb-8 rounded-lg border bg-card shadow-sm p-6">
        <h2 className="mb-3 text-lg font-semibold">{t("staff.inviteTitle")}</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("staff.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("staff.fullName")}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("staff.namePlaceholder")}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <Button
            onClick={handleInvite}
            disabled={inviting || !email.trim() || !fullName.trim()}
          >
            {inviting ? t("staff.inviting") : t("staff.sendInvite")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-gray-500">{t("common.loading")}</div>
      ) : staff.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState icon={Users} title={t("staff.empty")} description={t("staff.emptyDescription")} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-start">
                <th className="px-4 py-3 font-medium">{t("staff.name")}</th>
                <th className="px-4 py-3 font-medium">{t("staff.email")}</th>
                <th className="px-4 py-3 font-medium">{t("staff.status")}</th>
                <th className="px-4 py-3 font-medium">{t("staff.permissions")}</th>
                <th className="px-4 py-3 font-medium">{t("staff.invited")}</th>
                <th className="px-4 py-3 font-medium">{t("staff.account")}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{s.full_name}</td>
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {s.is_active ? t("staff.active") : t("staff.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StaffPermissionGrants
                      grants={grantsByStaff[s.id] ?? []}
                      staffName={s.full_name ?? s.email ?? ""}
                      staffIsActive={s.is_active}
                      onRevoke={refreshData}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(s.created_at).toLocaleDateString(locale === "ar" ? "ar-OM" : "en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <Button variant="destructive" size="sm" onClick={() => requestDeactivate(s.id, s.full_name ?? s.email ?? "")}>
                        {t("staff.deactivate")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => requestActivate(s.id, s.full_name ?? s.email ?? "")}>
                        {t("staff.reactivate")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.type === "activate" ? t("staff.reactivateTitle") : t("staff.deactivateTitle")}
        message={
          pendingAction
            ? pendingAction.type === "deactivate"
              ? t("staff.deactivateMessage", { name: pendingAction.name })
              : t("staff.reactivateMessage", { name: pendingAction.name })
            : ""
        }
        confirmLabel={acting ? t("staff.working") : pendingAction?.type === "activate" ? t("staff.reactivate") : t("staff.deactivate")}
        confirmDisabled={acting}
        variant={pendingAction?.type === "deactivate" ? "danger" : "default"}
        onCancel={() => setPendingAction(null)}
        onConfirm={handlePendingConfirm}
      />
    </div>
  )
}
