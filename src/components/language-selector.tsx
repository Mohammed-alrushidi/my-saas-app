"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Languages } from "lucide-react"
import { setLocalePreference } from "@/app/language-actions"
import { useLanguage } from "@/components/language-provider"
import type { Locale } from "@/lib/i18n"

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useLanguage()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale || saving) return
    setSaving(true)
    setError(null)
    const result = await setLocalePreference(nextLocale)
    if (result.success) {
      router.refresh()
    } else {
      setError(t("settings.saveFailed"))
    }
    setSaving(false)
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Languages size={16} aria-hidden="true" />
          {t("settings.languageTitle")}
        </div>
      )}
      <div className="inline-flex rounded-lg border bg-muted/30 p-1" role="group" aria-label={t("settings.languageTitle")}>
        {(["en", "ar"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => void changeLocale(value)}
            disabled={saving}
            aria-pressed={locale === value}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              locale === value ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "en" ? t("settings.english") : t("settings.arabic")}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
