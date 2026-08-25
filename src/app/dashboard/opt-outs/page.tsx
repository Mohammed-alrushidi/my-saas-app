"use client"

import { useState, useEffect, useCallback } from "react"
import { listOptOuts, addOptOut, removeOptOut } from "./actions"
import { getCurrentRole } from "../role-actions"
import { Notice } from "@/components/ui/notice"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Search, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OptOutData } from "./actions"

export default function OptOutsPage() {
  const [optOuts, setOptOuts] = useState<OptOutData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [newMobile, setNewMobile] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<OptOutData | null>(null)
  const [removing, setRemoving] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const fetchOptOuts = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const data = await listOptOuts(q || undefined)
      setOptOuts(data)
    } catch {
      setNotification({ type: "error", message: "Failed to load opt-outs. Please try again." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getCurrentRole().then((role) => setIsAdmin(role === "company_admin"))
    fetchOptOuts()
  }, [fetchOptOuts])

  function handleSearch() {
    fetchOptOuts(search)
  }

  async function handleAdd() {
    if (!newMobile.trim()) return
    const result = await addOptOut(newMobile.trim())
    if (result.success) {
      setNewMobile("")
      setShowAddForm(false)
      setNotification({ type: "success", message: "Opt-out added" })
      fetchOptOuts(search)
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to add" })
    }
  }

  function requestRemove(target: OptOutData) {
    setRemoveTarget(target)
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const result = await removeOptOut(removeTarget.id)
      if (result.success) {
        setNotification({ type: "success", message: "Opt-out removed" })
        setRemoveTarget(null)
        fetchOptOuts(search)
      } else {
        setNotification({ type: "error", message: result.error ?? "Failed to remove" })
      }
    } catch {
      setNotification({ type: "error", message: "Something went wrong. Please try again." })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Opt-Outs</h1>
          <p className="text-sm text-muted-foreground">
            Manage mobile numbers that have opted out of receiving messages.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddForm(true)}>
            Add Opt-Out
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border bg-card shadow-sm p-6">
          <input
            type="text"
            value={newMobile}
            onChange={(e) => setNewMobile(e.target.value)}
            placeholder="Enter mobile number"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <Button onClick={handleAdd}>
            Add
          </Button>
          <Button variant="outline" onClick={() => { setShowAddForm(false); setNewMobile("") }}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search by mobile number..."
          className="max-w-xs rounded border px-3 py-2 text-sm"
        />
        <Button variant="outline" onClick={handleSearch}>
          Search
        </Button>
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

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : optOuts.length === 0 ? (
        <EmptyState
          icon={search ? Search : PhoneOff}
          title={search ? "No matching opt-outs found" : "No opt-outs yet"}
          description={search ? undefined : "Opt-out numbers will appear here once customers opt out."}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium">Mobile Number</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Opted Out At</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {optOuts.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{o.mobile_no}</td>
                  <td className="px-4 py-3 capitalize">{o.source.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(o.opted_out_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <Button variant="destructive" size="sm" onClick={() => requestRemove(o)}>
                        Remove
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
        open={removeTarget !== null}
        title="Remove opt-out"
        message={removeTarget ? `Remove the opt-out for ${removeTarget.mobile_no}? The customer may receive messages again.` : ""}
        confirmLabel={removing ? "Working..." : "Remove"}
        confirmDisabled={removing}
        variant="danger"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  )
}
