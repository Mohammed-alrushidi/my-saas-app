"use client"

import { useState, useEffect, useCallback } from "react"
import { listOptOuts, addOptOut, removeOptOut } from "./actions"
import { getCurrentRole } from "../role-actions"
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
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Opt-Outs</h1>
          <p className="text-sm text-gray-500">
            Manage mobile numbers that have opted out of receiving messages.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Add Opt-Out
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border p-4">
          <input
            type="text"
            value={newMobile}
            onChange={(e) => setNewMobile(e.target.value)}
            placeholder="Enter mobile number"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            onClick={handleAdd}
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
          >
            Add
          </button>
          <button
            onClick={() => { setShowAddForm(false); setNewMobile("") }}
            className="rounded border px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
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
        <button
          onClick={handleSearch}
          className="rounded border px-4 py-2 text-sm hover:bg-gray-100"
        >
          Search
        </button>
      </div>

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

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : optOuts.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-gray-500">
          {search ? "No matching opt-outs found." : "No opt-outs yet. Click 'Add Opt-Out' to add one."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
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
                      <button
                        onClick={() => handleRemove(o.id, o.mobile_no)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
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
