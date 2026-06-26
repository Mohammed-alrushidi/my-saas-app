"use client"

import { useState, useEffect, useCallback } from "react"
import { listOptOuts, addOptOut, removeOptOut } from "./actions"
import { getCurrentRole } from "../role-actions"
import { Button } from "@/components/ui/button"
import type { OptOutData } from "./actions"

export default function OptOutsPage() {
  const [optOuts, setOptOuts] = useState<OptOutData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [newMobile, setNewMobile] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const fetchOptOuts = useCallback(async (q?: string) => {
    setLoading(true)
    const data = await listOptOuts(q || undefined)
    setOptOuts(data)
    setLoading(false)
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

  async function handleRemove(id: string, mobile: string) {
    if (!confirm(`Remove opt-out for ${mobile}?`)) return
    const result = await removeOptOut(id)
    if (result.success) {
      setNotification({ type: "success", message: "Opt-out removed" })
      fetchOptOuts(search)
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to remove" })
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
        <div
          className={`mb-4 rounded px-4 py-2 text-sm ${
            notification.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {notification.message}
          <Button variant="ghost" size="xs" className="ml-3 font-bold" onClick={() => setNotification(null)}>x</Button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : optOuts.length === 0 ? (
        <div className="rounded-lg border bg-card shadow-sm p-8 text-center text-gray-500">
          {search ? "No matching opt-outs found." : "No opt-outs yet. Click 'Add Opt-Out' to add one."}
        </div>
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
                      <Button variant="destructive" size="sm" onClick={() => handleRemove(o.id, o.mobile_no)}>
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
    </div>
  )
}
