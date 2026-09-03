"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Cake, ShieldCheck } from "lucide-react"
import {
  getBirthdayAutomationOverview,
  updateBirthdayAutomation,
  type BirthdayAutomationOverview,
} from "@/app/dashboard/birthdays/actions"
import { useLanguage } from "@/components/language-provider"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"

const CONFIRMATION = "ENABLE BIRTHDAY MESSAGES"

export function BirthdayAutomationCard() {
  const { locale, t } = useLanguage()
  const router = useRouter()
  const [overview, setOverview] = useState<BirthdayAutomationOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [templateId, setTemplateId] = useState("")
  const [sendTime, setSendTime] = useState("09:00")
  const [limitMode, setLimitMode] = useState<"shared" | "separate">("shared")
  const [dailyLimit, setDailyLimit] = useState("10")
  const [monthlyLimit, setMonthlyLimit] = useState("100")
  const [budgetEnabled, setBudgetEnabled] = useState(false)
  const [monthlyBudget, setMonthlyBudget] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)

  useEffect(() => {
    let active = true
    getBirthdayAutomationOverview().then((data) => {
      if (!active) return
      setOverview(data)
      const settings = data?.settings
      if (settings) {
        setTemplateId(settings.template_id ?? data.approvedTemplates[0]?.id ?? "")
        setSendTime(settings.send_time.slice(0, 5))
        setLimitMode(settings.limit_mode)
        setDailyLimit(String(settings.daily_limit ?? 10))
        setMonthlyLimit(String(settings.monthly_limit ?? 100))
        setBudgetEnabled(settings.budget_protection_enabled)
        setMonthlyBudget(settings.monthly_budget_baisa == null ? "" : String(settings.monthly_budget_baisa / 1000))
        setPermissionConfirmed(settings.permission_confirmation_version === "birthday-contact-v1")
      } else if (data?.approvedTemplates[0]) {
        setTemplateId(data.approvedTemplates[0].id)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const selectedTemplate = overview?.approvedTemplates.find((template) => template.id === templateId)
  const currency = useMemo(() => new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-OM", {
    style: "currency",
    currency: "OMR",
    minimumFractionDigits: 3,
  }), [locale])

  async function save(enabled: boolean) {
    setSaving(true)
    setNotice(null)
    const budgetBaisa = monthlyBudget.trim() === "" ? null : Math.round(Number(monthlyBudget) * 1000)
    const result = await updateBirthdayAutomation({
      enabled,
      templateId: templateId || null,
      sendTime,
      timezone: "Asia/Muscat",
      limitMode,
      dailyLimit: limitMode === "separate" ? Number(dailyLimit) : null,
      monthlyLimit: limitMode === "separate" ? Number(monthlyLimit) : null,
      budgetProtectionEnabled: budgetEnabled,
      monthlyBudgetBaisa: budgetEnabled ? budgetBaisa : null,
      confirmation: enabled ? confirmation : "",
      permissionConfirmed,
    })
    if (result.success) {
      setOverview((current) => current && current.settings ? {
        ...current,
        settings: { ...current.settings, is_enabled: enabled },
      } : current)
      setModalOpen(false)
      setConfirmation("")
      setNotice({ type: "success", text: enabled ? t("birthdaySettings.enabled") : t("birthdaySettings.disabled") })
      router.refresh()
    } else {
      setNotice({ type: "error", text: result.error === "approved_marketing_template_required" ? t("birthdaySettings.enableBlocked") : t("settings.saveFailed") })
    }
    setSaving(false)
  }

  if (loading) return <div className="max-w-2xl rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
  if (!overview) return null

  const enabled = overview.settings?.is_enabled ?? false
  const hasApprovedTemplate = overview.approvedTemplates.length > 0

  return (
    <section className="mb-6 max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b p-6">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-700">
            <Cake size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">{t("birthdaySettings.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("birthdaySettings.description")}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
          {enabled ? t("birthdaySettings.enabled") : t("birthdaySettings.disabled")}
        </span>
      </div>

      <div className="space-y-4 p-6">
        {notice && <Notice variant={notice.type === "success" ? "success" : "error"}>{notice.text}</Notice>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{t("birthdaySettings.next30Days")}</div>
            <div className="mt-1 text-xl font-bold">{overview.eligibleNext30Days}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{t("birthdaySettings.estimatedCost")}</div>
            <div className="mt-1 font-semibold">{selectedTemplate?.estimated_unit_cost_baisa == null ? "—" : currency.format(selectedTemplate.estimated_unit_cost_baisa / 1000)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{t("birthdaySettings.monthlyBudget")}</div>
            <div className="mt-1 font-semibold">{overview.estimatedMonthlyCostBaisa == null ? "—" : currency.format(overview.estimatedMonthlyCostBaisa / 1000)}</div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="mb-2 text-sm font-semibold">{t("birthdaySettings.exclusions")}</div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <span>{t("birthdaySettings.optOut")}: {overview.exclusions.optOut}</span>
            <span>{t("birthdaySettings.invalidMobile")}: {overview.exclusions.invalidMobile}</span>
            <span>{t("birthdaySettings.missingConsent")}: {overview.exclusions.missingConsent}</span>
            <span>{t("birthdaySettings.missingDob")}: {overview.exclusions.missingDob}</span>
            <span>{t("birthdaySettings.duplicate")}: {overview.exclusions.duplicate}</span>
            <span>{t("birthdaySettings.templateUnavailable")}: {overview.exclusions.templateUnavailable}</span>
          </div>
        </div>

        {!overview.canManage ? (
          <Notice variant="warning">{t("birthdaySettings.adminOnly")}</Notice>
        ) : enabled ? (
          <Button variant="destructive" onClick={() => void save(false)} disabled={saving}>
            {saving ? t("common.saving") : t("birthdaySettings.disable")}
          </Button>
        ) : (
          <div className="space-y-2">
            {!hasApprovedTemplate && (
              <Notice variant="warning">
                <div className="font-semibold">{t("birthdaySettings.setupRequired")}</div>
                <p className="mt-1 text-sm">{t("birthdaySettings.setupDescription")}</p>
                <Link href="/dashboard/templates" className="mt-2 inline-block font-medium underline underline-offset-2">
                  {t("birthdaySettings.reviewDraft")}
                </Link>
              </Notice>
            )}
            <Button onClick={() => setModalOpen(true)} disabled={!hasApprovedTemplate}>
              {t("birthdaySettings.enable")}
            </Button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={t("birthdaySettings.confirmTitle")}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><ShieldCheck size={19} /></span>
              <div>
                <h3 className="font-semibold">{t("birthdaySettings.confirmTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("birthdaySettings.marketingNotice")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-medium">
                {t("nav.templates")}
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2">
                  {overview.approvedTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">{t("birthdaySettings.time")}<input type="time" value={sendTime} onChange={(event) => setSendTime(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" /></label>
                <label className="text-sm font-medium">{t("birthdaySettings.timezone")}<input value="Asia/Muscat" disabled className="mt-1 w-full rounded-md border bg-muted px-3 py-2" /></label>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("birthdaySettings.limitMode")}</legend>
                <label className="flex gap-2 text-sm"><input type="radio" checked={limitMode === "shared"} onChange={() => setLimitMode("shared")} />{t("birthdaySettings.sharedLimits")}</label>
                <label className="flex gap-2 text-sm"><input type="radio" checked={limitMode === "separate"} onChange={() => setLimitMode("separate")} />{t("birthdaySettings.separateLimits")}</label>
                {limitMode === "separate" && <div className="grid grid-cols-2 gap-3"><input type="number" min="1" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} className="rounded-md border px-3 py-2" aria-label={t("birthdaySettings.dailyLimit")} /><input type="number" min="1" value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} className="rounded-md border px-3 py-2" aria-label={t("birthdaySettings.monthlyLimit")} /></div>}
              </fieldset>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={budgetEnabled} onChange={(event) => setBudgetEnabled(event.target.checked)} />{t("birthdaySettings.budgetProtection")}</label>
              {budgetEnabled && <label className="block text-sm font-medium">{t("birthdaySettings.monthlyBudget")}<input type="number" min="0" step="0.001" value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" /></label>}
              <label className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} />{t("birthdaySettings.permissionConfirmation")}</label>
              <label className="block text-sm font-medium">{t("birthdaySettings.confirmPhrase")}<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 font-mono" dir="ltr" /></label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setModalOpen(false); setConfirmation("") }}>{t("common.cancel")}</Button>
              <Button onClick={() => void save(true)} disabled={saving || !permissionConfirmed || confirmation !== CONFIRMATION}>{saving ? t("common.saving") : t("birthdaySettings.enable")}</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
