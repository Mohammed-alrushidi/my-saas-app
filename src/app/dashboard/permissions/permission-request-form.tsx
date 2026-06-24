"use client"

import { useState } from "react"
import { createPermissionRequest } from "./actions"
import { COMPANY_PERMISSIONS } from "@/lib/permission-types"

const PERMISSION_LABELS: Record<string, string> = {
  "templates:edit": "Templates: Edit",
  "reminder_settings:edit": "Reminder Settings: Edit",
  "broadcast:create": "Broadcast: Create",
}

const MIN_REASON = 10
const MAX_REASON = 500

export default function PermissionRequestForm() {
  const [permission, setPermission] = useState("")
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSubmitting(true)

    const result = await createPermissionRequest(permission, reason)

    if (result.success) {
      setMessage({ type: "success", text: "Request submitted successfully" })
      setPermission("")
      setReason("")
    } else {
      setMessage({ type: "error", text: result.error ?? "Something went wrong" })
    }

    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Request a Permission</h2>

      <div>
        <label htmlFor="permission" className="mb-1 block text-sm font-medium">
          Permission type
        </label>
        <select
          id="permission"
          value={permission}
          onChange={(e) => setPermission(e.target.value)}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Select a permission...</option>
          {COMPANY_PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {PERMISSION_LABELS[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Reason
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={MAX_REASON}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Explain why you need this permission..."
        />
        <p className={`mt-1 text-xs ${reason.length < MIN_REASON ? "text-muted-foreground" : "text-green-600"}`}>
          {reason.length}/{MAX_REASON} characters{reason.length >= MIN_REASON ? " ✓" : ` (min ${MIN_REASON})`}
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting || reason.trim().length < MIN_REASON || !permission}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Request"}
      </button>

      {message && (
        <p
          className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}
    </form>
  )
}
