"use client"

import { useState } from "react"
import { createPermissionRequest } from "./actions"
import { COMPANY_PERMISSIONS } from "@/lib/permission-types"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"

const MIN_REASON = 10
const MAX_REASON = 500

export default function PermissionRequestForm() {
  const { t } = useLanguage()
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
      setMessage({ type: "success", text: t("permissions.submitted") })
      setPermission("")
      setReason("")
    } else {
      setMessage({ type: "error", text: result.error ?? t("permissions.submitFailed") })
    }

    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{t("permissions.requestTitle")}</h2>

      <div>
        <label htmlFor="permission" className="mb-1 block text-sm font-medium">
          {t("permissions.type")}
        </label>
        <select
          id="permission"
          value={permission}
          onChange={(e) => setPermission(e.target.value)}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
        >
          <option value="">{t("permissions.select")}</option>
          {COMPANY_PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {p === "templates:edit"
                ? t("permission.templates")
                : p === "reminder_settings:edit"
                  ? t("permission.reminders")
                  : p === "broadcast:create"
                    ? t("permission.broadcast")
                    : t("permission.birthdaySend")}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          {t("permissions.reason")}
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={MAX_REASON}
          required
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder={t("permissions.reasonPlaceholder")}
        />
        <p className={`mt-1 text-xs ${reason.length < MIN_REASON ? "text-muted-foreground" : "text-green-600"}`}>
          {t("permissions.characters", { count: reason.length, max: MAX_REASON })}
          {reason.length >= MIN_REASON ? " ✓" : ` (${t("permissions.minimum", { min: MIN_REASON })})`}
        </p>
      </div>

      <Button
        type="submit"
        disabled={submitting || reason.trim().length < MIN_REASON || !permission}
      >
        {submitting ? t("permissions.submitting") : t("permissions.submit")}
      </Button>

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
