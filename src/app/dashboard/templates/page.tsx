"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { getTemplates, saveTemplate, resetTemplate } from "./actions"
import { getDashboardCapabilities } from "../role-actions"
import { Button } from "@/components/ui/button"
import type { TemplateData } from "./actions"

const VARIABLES: { variable: string; description: string; types: string[] }[] = [
  { variable: "{{customer_name}}", description: "Customer's full name", types: ["renewal", "birthday", "broadcast"] },
  { variable: "{{company_name}}", description: "Insurance company name", types: ["renewal", "birthday", "broadcast"] },
  { variable: "{{veh_make_model}}", description: "Vehicle make and model", types: ["renewal"] },
  { variable: "{{policy_expiry_date}}", description: "Policy expiry date", types: ["renewal"] },
  { variable: "{{days_remaining}}", description: "Days until expiry", types: ["renewal"] },
  { variable: "{{new_premium_vat_amount}}", description: "Renewal premium amount", types: ["renewal"] },
]

const TYPE_LABELS: Record<string, string> = {
  renewal: "Renewal Reminder",
  birthday: "Birthday Greeting",
  broadcast: "Broadcast / Campaign",
}

type Notification = { type: "success" | "error"; message: string } | null

function TemplateCard({
  template,
  notification,
  onNotificationClear,
  canEdit,
}: {
  template: TemplateData
  notification: Notification
  onNotificationClear: () => void
  canEdit: boolean
}) {
  const [body, setBody] = useState(template.body)
  const [name, setName] = useState(template.name)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [localNotification, setLocalNotification] = useState<Notification>(null)

  const showNotification = notification && template.id.startsWith(notification.message)
    ? notification
    : localNotification

  useEffect(() => {
    setBody(template.body)
    setName(template.name)
  }, [template.body, template.name])

  async function handleSave() {
    setSaving(true)
    const result = await saveTemplate(template.id, body, name)
    setSaving(false)
    if (result.success) {
      setLocalNotification({ type: "success", message: "Saved" })
    } else {
      setLocalNotification({ type: "error", message: result.error ?? "Failed to save" })
    }
  }

  async function handleReset() {
    if (!confirm("Reset this template to the default?")) return
    setResetting(true)
    const result = await resetTemplate(template.template_type)
    setResetting(false)
    if (result.success) {
      setLocalNotification({ type: "success", message: "Reset to default" })
    } else {
      setLocalNotification({ type: "error", message: result.error ?? "Failed to reset" })
    }
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{TYPE_LABELS[template.template_type]}</h2>
          {template.is_default && (
            <span className="inline-block mt-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              Default
            </span>
          )}
        </div>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
          {template.template_type}
        </span>
      </div>

      <label className="mb-1 block text-sm font-medium text-gray-700">Template Name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!canEdit}
        className="mb-3 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
      />

      <label className="mb-1 block text-sm font-medium text-gray-700">Message Body</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!canEdit}
        rows={6}
        className="mb-3 w-full rounded border px-3 py-2 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
      />

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={resetting}>
            {resetting ? "Resetting..." : "Reset to Default"}
          </Button>
        </div>
      )}
      {showNotification && (
        <span
          className={`text-sm ${showNotification.type === "success" ? "text-green-600" : "text-red-600"}`}
        >
          {showNotification.message}
        </span>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [notification, setNotification] = useState<Notification>(null)

  useEffect(() => {
    Promise.all([getTemplates(), getDashboardCapabilities()]).then(([data, caps]) => {
      setTemplates(data)
      setCanEdit(caps?.canEditTemplates ?? false)
      setRole(caps?.role ?? null)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="p-8 text-gray-500">Loading templates...</div>
  }

  if (templates.length === 0) {
    return (
      <div className="p-8">
        <h1 className="mb-2 text-2xl font-bold">Message Templates</h1>
        <p className="text-sm text-muted-foreground">No templates found. Please run the database migration.</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="mb-2 text-2xl font-bold">Message Templates</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Edit the message templates used for sending WhatsApp messages to customers.
      </p>

      {!canEdit && role !== "company_admin" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You don&apos;t have permission to edit templates.{" "}
          <Link href="/dashboard/permissions" className="underline font-medium">Request access</Link>.
        </div>
      )}

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            notification={notification}
            onNotificationClear={() => setNotification(null)}
            canEdit={canEdit}
          />
        ))}
      </div>

      <div className="rounded-lg border bg-card shadow-sm p-6">
        <h2 className="mb-3 text-lg font-semibold">Available Variables</h2>
        <p className="mb-3 text-sm text-gray-500">
          Use these variables in your message body. They will be replaced with actual customer data when the message
          is sent.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium">Variable</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Available In</th>
              </tr>
            </thead>
            <tbody>
              {VARIABLES.map((v) => (
                <tr key={v.variable} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-blue-600">{v.variable}</td>
                  <td className="px-4 py-3 text-gray-600">{v.description}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {v.types.map((t) => TYPE_LABELS[t]).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}