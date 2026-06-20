"use client"

import { useState, useEffect } from "react"
import { getSettings, saveSettings, resetSettings } from "./actions"
import { getCurrentRole } from "../role-actions"
import type { SettingsData } from "./actions"

const DAY_OPTIONS = [7, 14, 30] as const

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [reminderDays, setReminderDays] = useState<number[]>([30, 14, 7])
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    Promise.all([getSettings(), getCurrentRole()]).then(([data, role]) => {
      if (data) {
        setSettings(data)
        setReminderDays(data.reminder_days)
        setIsActive(data.is_active)
      }
      setIsAdmin(role === "company_admin")
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
    const result = await saveSettings(reminderDays, isActive)
    setSaving(false)
    setNotification({
      type: result.success ? "success" : "error",
      message: result.success ? "Settings saved" : result.error ?? "Failed to save",
    })
  }

  async function handleReset() {
    if (!confirm("Reset reminder settings to defaults?")) return
    setResetting(true)
    const result = await resetSettings()
    setResetting(false)
    if (result.success) {
      setReminderDays([30, 14, 7])
      setIsActive(true)
      setNotification({ type: "success", message: "Reset to default" })
    } else {
      setNotification({ type: "error", message: result.error ?? "Failed to reset" })
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Loading settings...</div>
  }

  if (!settings) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-bold">Reminder Settings</h1>
        <p className="text-gray-500">No settings found. Please run the database migration.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-bold">Reminder Settings</h1>
      <p className="mb-6 text-gray-500">
        Configure when reminder messages are sent before a policy expires.
      </p>

      <div className="max-w-lg rounded-lg border p-6">
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
                  disabled={!isAdmin}
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
              disabled={!isAdmin}
              className="h-4 w-4 disabled:opacity-50"
            />
            <span className="text-sm">Reminder messages are active</span>
          </label>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="rounded border px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {resetting ? "Resetting..." : "Reset to Default"}
            </button>
          </div>
        )}
        {notification && (
          <span className={`text-sm ${notification.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {notification.message}
          </span>
        )}
      </div>
    </div>
  )
}
