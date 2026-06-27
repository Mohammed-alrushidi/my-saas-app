"use client"

import { useState, useEffect, useCallback } from "react"
import { listStaff, inviteStaff, deactivateStaff, activateStaff, getCompanyStaffGrants } from "./actions"
import type { StaffMember } from "./actions"
import StaffPermissionGrants from "./staff-permission-grants"
import type { StaffPermissionGrant } from "./staff-permission-grants"
import { EmptyState } from "@/components/ui/empty-state"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [grantsByStaff, setGrantsByStaff] = useState<Record<string, StaffPermissionGrant[]>>({})
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [inviting, setInviting] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const refreshData = useCallback(async () => {
    setLoading(true)
    const [staffData, grantsData] = await Promise.all([listStaff(), getCompanyStaffGrants()])
    setStaff(staffData)
    const map: Record<string, StaffPermissionGrant[]> = {}
    for (const s of grantsData) {
      map[s.id] = s.grants
    }
    setGrantsByStaff(map)
    setLoading(false)
  }, [])

  useEffect(() => { refreshData() }, [refreshData])

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return
    setInviting(true)
    const result = await inviteStaff(email, fullName)
    setInviting(false)
    if (result.success) {
      setEmail("")
      setFullName("")
      setNotification({ type: "success", message: "Invitation sent. The staff member will receive an email to set their password." })
      refreshData()
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to invite" })
    }
  }

  async function handleDeactivate(userId: string, name: string) {
    if (!confirm(`Deactivate ${name}? They will lose access to the dashboard.`)) return
    const result = await deactivateStaff(userId)
    if (result.success) {
      setNotification({ type: "success", message: "Staff deactivated" })
      refreshData()
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to deactivate" })
    }
  }

  async function handleActivate(userId: string, name: string) {
    if (!confirm(`Reactivate ${name}?`)) return
    const result = await activateStaff(userId)
    if (result.success) {
      setNotification({ type: "success", message: "Staff reactivated" })
      refreshData()
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to reactivate" })
    }
  }

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold">Staff Management</h1>
      <p className="mb-6 text-sm text-muted-foreground">Invite and manage staff members in your company.</p>

      {notification && (
        <div
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            notification.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {notification.message}
          <Button variant="ghost" size="xs" className="ml-3 font-bold" onClick={() => setNotification(null)}>x</Button>
        </div>
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
        <p className="text-gray-500">Loading...</p>
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
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{s.full_name}</td>
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
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
                      <Button variant="destructive" size="sm" onClick={() => handleDeactivate(s.id, s.full_name ?? s.email ?? "")}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleActivate(s.id, s.full_name ?? s.email ?? "")}>
                        Reactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
