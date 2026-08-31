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

type PendingStaffAction = {
  type: "deactivate" | "activate"
  userId: string
  name: string
}

export default function StaffPage() {
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
      setNotification({ type: "error", message: "Failed to load staff. Please refresh the page." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshData() }, [refreshData])

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return
    setInviting(true)
    try {
      const result = await inviteStaff(email, fullName)
      if (result.success) {
        setEmail("")
        setFullName("")
        setNotification({ type: "success", message: "Invitation sent. The staff member will receive an email to set their password." })
        refreshData()
      } else {
        setNotification({ type: "error", message: result.error ?? "Failed to invite" })
      }
    } catch {
      setNotification({ type: "error", message: "Something went wrong. Please try again." })
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
        setNotification({ type: "success", message: type === "deactivate" ? "Staff deactivated" : "Staff reactivated" })
        setPendingAction(null)
        refreshData()
      } else {
        setNotification({
          type: "error",
          message: result.error ?? (type === "deactivate" ? "Failed to deactivate" : "Failed to reactivate"),
        })
      }
    } catch {
      setNotification({ type: "error", message: "Something went wrong. Please try again." })
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <p className="text-sm text-muted-foreground">Invite and manage staff members in your company.</p>
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
        <h2 className="mb-3 text-lg font-semibold">Invite Staff</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <Button
            onClick={handleInvite}
            disabled={inviting || !email.trim() || !fullName.trim()}
          >
            {inviting ? "Inviting..." : "Send Invite"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading...</div>
      ) : staff.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState icon={Users} title="No staff members yet" description="Invite your first staff member above." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">الصلاحيات النشطة</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3 font-medium">إدارة الحساب</th>
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
                      {s.is_active ? "Active" : "Inactive"}
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
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <Button variant="destructive" size="sm" onClick={() => requestDeactivate(s.id, s.full_name ?? s.email ?? "")}>
                        تعطيل الموظف
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => requestActivate(s.id, s.full_name ?? s.email ?? "")}>
                        إعادة التفعيل
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
        title={pendingAction?.type === "activate" ? "إعادة تفعيل الموظف" : "تعطيل الموظف"}
        message={
          pendingAction
            ? pendingAction.type === "deactivate"
              ? `تعطيل الموظف ${pendingAction.name}؟ سيفقد إمكانية الدخول إلى لوحة التحكم، ولن تُحذف بياناته.`
              : `إعادة تفعيل الموظف ${pendingAction.name}؟ سيتمكن من الدخول إلى لوحة التحكم مجددًا.`
            : ""
        }
        confirmLabel={acting ? "جارٍ التنفيذ..." : pendingAction?.type === "activate" ? "إعادة التفعيل" : "تعطيل الموظف"}
        confirmDisabled={acting}
        variant={pendingAction?.type === "deactivate" ? "danger" : "default"}
        onCancel={() => setPendingAction(null)}
        onConfirm={handlePendingConfirm}
      />
    </div>
  )
}
