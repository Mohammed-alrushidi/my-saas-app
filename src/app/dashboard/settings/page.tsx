"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { getSettings, saveSettings, resetSettings } from "./actions"
import { getDashboardCapabilities } from "../role-actions"
import { Notice } from "@/components/ui/notice"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SettingsData } from "./actions"

const DAY_OPTIONS = [7, 14, 30] as const

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [reminderDays, setReminderDays] = useState<number[]>([30, 14, 7])
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    Promise.all([getSettings(), getDashboardCapabilities()]).then(([data, caps]) => {
      if (data) {
        setSettings(data)
        setReminderDays(data.reminder_days)
        setIsActive(data.is_active)
      }
      setCanEdit(caps?.canEditSettings ?? false)
      setRole(caps?.role ?? null)
      setLoading(false)
    })
  }, [])

  function toggleDay(day: number) {
    setReminderDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveSettings(reminderDays, isActive)
      setNotification({
        type: result.success ? "success" : "error",
        message: result.success ? "Settings saved" : result.error ?? "Failed to save",
      })
    } catch {
      setNotification({ type: "error", message: "Something went wrong. Please try again." })
    } finally {
      setSaving(false)
    }
  }

  function requestReset() {
    setConfirmReset(true)
  }

  async function handleReset() {
    setResetting(true)
    try {
      const result = await resetSettings()
      if (result.success) {
        setReminderDays([30, 14, 7])
        setIsActive(true)
        setConfirmReset(false)
        setNotification({ type: "success", message: "Reset to default" })
      } else {
        setNotification({ type: "error", message: result.error ?? "Failed to reset" })
      }
    } catch {
      setNotification({ type: "error", message: "Something went wrong. Please try again." })
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading settings...</div>
  }

  if (!settings) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Reminder Settings</h1>
        </div>
        <EmptyState
          icon={Settings}
          title="No settings found"
          description="Reminder settings need to be configured before automated reminders can run. Run the database seed to create default settings."
        />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reminder Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure when reminder messages are sent before a policy expires.
        </p>
      </div>

      {!canEdit && role !== "company_admin" && (
        <Notice variant="warning" className="mb-6">
          You don&apos;t have permission to edit settings.{" "}
          <Link href="/dashboard/permissions" className="underline font-medium">Request access</Link>.
        </Notice>
      )}

      <div className="max-w-lg rounded-lg border bg-card shadow-sm p-6">
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Reminder Days</h2>
          <p className="mb-3 text-sm text-gray-500">
            Select how many days before expiry a reminder is sent. At least one must be selected when active.
          </p>
          <div className="flex flex-col gap-2">
            {DAY_OPTIONS.map((day) => (
              <label key={day} className="flex items-center gap-3 rounded border px-3 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={reminderDays.includes(day)}
                  onChange={() => toggleDay(day)}
                  disabled={!canEdit}
                  className="h-4 w-4 disabled:opacity-50"
                />
                <span className="text-sm">{day} days before expiry</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Status</h2>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={!canEdit}
              className="h-4 w-4 disabled:opacity-50"
            />
            <span className="text-sm">Reminder messages are active</span>
          </label>
        </div>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={requestReset} disabled={resetting}>
              {resetting ? "Resetting..." : "Reset to Default"}
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={confirmReset}
          title="Reset reminder settings"
          message="Reset reminder settings to defaults? Your current configuration will be replaced."
          confirmLabel={resetting ? "Working..." : "Reset"}
          confirmDisabled={resetting}
          variant="danger"
          onCancel={() => setConfirmReset(false)}
          onConfirm={handleReset}
        />
        {notification && (
          <Notice
            variant={notification.type === "success" ? "success" : "error"}
            className="mt-3"
            dismissible
            onDismiss={() => setNotification(null)}
          >
            {notification.message}
          </Notice>
        )}
      </div>
    </div>
  )
}
