"use client"

import { useState, useEffect, useCallback } from "react"
import { listStaff, inviteStaff, deactivateStaff, activateStaff } from "./actions"
import type { StaffMember } from "./actions"

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [inviting, setInviting] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const fetchStaff = useCallback(async () => {
    setLoading(true)
    const data = await listStaff()
    setStaff(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return
    setInviting(true)
    const result = await inviteStaff(email, fullName)
    setInviting(false)
    if (result.success) {
      setEmail("")
      setFullName("")
      setNotification({ type: "success", message: "Invitation sent. The staff member will receive an email to set their password." })
      fetchStaff()
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to invite" })
    }
  }

  async function handleDeactivate(userId: string, name: string) {
    if (!confirm(`Deactivate ${name}? They will lose access to the dashboard.`)) return
    const result = await deactivateStaff(userId)
    if (result.success) {
      setNotification({ type: "success", message: "Staff deactivated" })
      fetchStaff()
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to deactivate" })
    }
  }

  async function handleActivate(userId: string, name: string) {
    if (!confirm(`Reactivate ${name}?`)) return
    const result = await activateStaff(userId)
    if (result.success) {
      setNotification({ type: "success", message: "Staff reactivated" })
      fetchStaff()
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to reactivate" })
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-bold">Staff Management</h1>
      <p className="mb-6 text-sm text-gray-500">Invite and manage staff members in your company.</p>

      {notification && (
        <div
          className={`mb-4 rounded px-4 py-2 text-sm ${
            notification.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {notification.message}
          <button className="ml-3 font-bold" onClick={() => setNotification(null)}>x</button>
        </div>
      )}

      <div className="mb-8 rounded-lg border p-4">
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
          <button
            onClick={handleInvite}
            disabled={inviting || !email.trim() || !fullName.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {inviting ? "Inviting..." : "Send Invite"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : staff.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-gray-500">
          No staff members yet. Invite your first staff member above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_active ? (
                      <button
                        onClick={() => handleDeactivate(s.id, s.full_name ?? s.email ?? "")}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(s.id, s.full_name ?? s.email ?? "")}
                        className="text-sm text-green-600 hover:text-green-800"
                      >
                        Reactivate
                      </button>
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
