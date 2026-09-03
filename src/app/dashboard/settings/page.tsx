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
import { useLanguage } from "@/components/language-provider"
import { LanguageSelector } from "@/components/language-selector"
import { BirthdayAutomationCard } from "./birthday-automation-card"

const DAY_OPTIONS = [7, 14, 30] as const

export default function SettingsPage() {
  const { t } = useLanguage()
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
        message: result.success ? t("settings.saved") : result.error ?? t("settings.saveFailed"),
      })
    } catch {
      setNotification({ type: "error", message: t("settings.saveFailed") })
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
        setNotification({ type: "success", message: t("settings.reset") })
      } else {
        setNotification({ type: "error", message: result.error ?? t("settings.saveFailed") })
      }
    } catch {
      setNotification({ type: "error", message: t("settings.saveFailed") })
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">{t("common.loading")}</div>
  }

  if (!settings) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        </div>
        <EmptyState
          icon={Settings}
          title={t("settings.noSettings")}
          description={t("settings.noSettingsDescription")}
        />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.description")}
        </p>
      </div>

      <section className="mb-6 max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <LanguageSelector />
        <p className="mt-2 text-sm text-muted-foreground">{t("settings.languageDescription")}</p>
      </section>

      <BirthdayAutomationCard />

      {!canEdit && role !== "company_admin" && (
        <Notice variant="warning" className="mb-6">
          {t("settings.noPermission")}{" "}
          <Link href="/dashboard/permissions" className="underline font-medium">{t("settings.requestAccess")}</Link>.
        </Notice>
      )}

      <div className="max-w-lg rounded-lg border bg-card shadow-sm p-6">
        <div className="mb-6">
          <h2 className="mb-1 text-lg font-semibold">{t("settings.reminderTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("settings.reminderDescription")}</p>
          <h3 className="mb-3 text-sm font-semibold">{t("settings.reminderDays")}</h3>
          <p className="mb-3 text-sm text-gray-500">
            {t("settings.reminderDaysHelp")}
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
                <span className="text-sm">{t("settings.daysBefore", { day })}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">{t("settings.reminderStatus")}</h2>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={!canEdit}
              className="h-4 w-4 disabled:opacity-50"
            />
            <span className="text-sm">{t("settings.reminderActive")}</span>
          </label>
        </div>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
            <Button variant="outline" onClick={requestReset} disabled={resetting}>
              {resetting ? t("common.loading") : t("settings.reset")}
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={confirmReset}
          title={t("settings.resetTitle")}
          message={t("settings.resetMessage")}
          confirmLabel={resetting ? t("common.loading") : t("settings.reset")}
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
