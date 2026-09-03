"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { getTemplates, saveTemplate, resetTemplate } from "./actions"
import { getDashboardCapabilities } from "../role-actions"
import { Notice } from "@/components/ui/notice"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"
import type { TemplateData } from "./actions"

type TemplateType = TemplateData["template_type"]
type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

const VARIABLES: { variable: string; descriptionKey: TranslationKey; types: TemplateType[] }[] = [
  { variable: "{{customer_name}}", descriptionKey: "templates.varCustomerName", types: ["renewal", "birthday", "broadcast"] },
  { variable: "{{company_name}}", descriptionKey: "templates.varCompanyName", types: ["renewal", "birthday", "broadcast"] },
  { variable: "{{veh_make_model}}", descriptionKey: "templates.varVehicle", types: ["renewal"] },
  { variable: "{{policy_expiry_date}}", descriptionKey: "templates.varExpiry", types: ["renewal"] },
  { variable: "{{days_remaining}}", descriptionKey: "templates.varDays", types: ["renewal"] },
  { variable: "{{new_premium_vat_amount}}", descriptionKey: "templates.varPremium", types: ["renewal"] },
]

const TYPE_LABEL_KEYS: Record<TemplateType, TranslationKey> = {
  renewal: "templates.typeRenewal",
  birthday: "templates.typeBirthday",
  broadcast: "templates.typeBroadcast",
}

const TEMPLATE_ERROR_KEYS: Record<string, TranslationKey> = {
  "No company assigned": "templates.errorNoCompany",
  "You don't have permission to edit templates": "templates.errorPermission",
  "Template body cannot be empty": "templates.errorEmptyBody",
  "Invalid template type": "templates.errorInvalidType",
}

function translateTemplateError(message: string | undefined, t: Translate): string {
  if (!message) return t("templates.genericError")
  return t(TEMPLATE_ERROR_KEYS[message] ?? "templates.genericError")
}

type Notification = { type: "success" | "error"; message: string } | null

function TemplateCard({
  template,
  canEdit,
}: {
  template: TemplateData
  canEdit: boolean
}) {
  const { t } = useLanguage()
  const [body, setBody] = useState(template.body)
  const [name, setName] = useState(template.name)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [localNotification, setLocalNotification] = useState<Notification>(null)
  const birthdayProviderReady = template.template_type === "birthday"
    && template.provider_category === "marketing"
    && template.provider_status === "approved"
    && /^HX[0-9a-f]{32}$/i.test(template.provider_template_id ?? "")

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveTemplate(template.id, body, name)
      if (result.success) {
        setLocalNotification({ type: "success", message: t("templates.saved") })
      } else {
        setLocalNotification({ type: "error", message: translateTemplateError(result.error, t) })
      }
    } catch {
      setLocalNotification({ type: "error", message: t("templates.genericError") })
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
      const result = await resetTemplate(template.template_type)
      if (result.success) {
        setConfirmReset(false)
        setLocalNotification({ type: "success", message: t("templates.resetDone") })
      } else {
        setLocalNotification({ type: "error", message: translateTemplateError(result.error, t) })
      }
    } catch {
      setLocalNotification({ type: "error", message: t("templates.genericError") })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t(TYPE_LABEL_KEYS[template.template_type])}</h2>
          {template.is_default && (
            <span className="inline-block mt-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              {t("templates.default")}
            </span>
          )}
        </div>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
          {t(TYPE_LABEL_KEYS[template.template_type])}
        </span>
      </div>

      <label className="mb-1 block text-sm font-medium text-gray-700">{t("templates.name")}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!canEdit}
        className="mb-3 w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
      />

      <label className="mb-1 block text-sm font-medium text-gray-700">{t("templates.body")}</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!canEdit}
        rows={6}
        className="mb-3 w-full rounded border px-3 py-2 text-sm font-mono disabled:bg-gray-100 disabled:text-gray-500"
      />

      {template.template_type === "birthday" && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${birthdayProviderReady ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <div className="font-semibold">
            {birthdayProviderReady ? t("templates.providerReady") : t("templates.providerDraft")}
          </div>
          <p className="mt-1 text-xs leading-5">
            {birthdayProviderReady ? t("templates.providerReadyDescription") : t("templates.providerDraftDescription")}
          </p>
          {birthdayProviderReady && template.provider_template_id && (
            <div className="mt-2 font-mono text-xs" dir="ltr">
              {t("templates.contentSid")}: {template.provider_template_id}
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("templates.saving") : t("templates.save")}
          </Button>
          <Button variant="outline" onClick={requestReset} disabled={resetting}>
            {resetting ? t("templates.resetting") : t("templates.resetDefault")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        title={t("templates.resetTitle")}
        message={t("templates.resetMessage")}
        confirmLabel={resetting ? t("templates.working") : t("templates.reset")}
        confirmDisabled={resetting}
        variant="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={handleReset}
      />
      {localNotification && (
        <Notice
          variant={localNotification.type === "success" ? "success" : "error"}
          className="mt-3"
        >
          {localNotification.message}
        </Notice>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  const { t } = useLanguage()
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getTemplates(), getDashboardCapabilities()])
      .then(([data, caps]) => {
        setTemplates(data)
        setCanEdit(caps?.canEditTemplates ?? false)
        setRole(caps?.role ?? null)
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">{t("templates.loading")}</div>
  }

  if (loadFailed) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="mb-4 text-2xl font-bold">{t("templates.title")}</h1>
        <Notice variant="error">{t("templates.loadFailed")}</Notice>
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="mb-2 text-2xl font-bold">{t("templates.title")}</h1>
        <EmptyState
          icon={FileText}
          title={t("templates.empty")}
          description={t("templates.emptyDescription")}
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("templates.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("templates.description")}
        </p>
      </div>

      {!canEdit && role !== "company_admin" && (
        <Notice variant="warning" className="mb-6">
          {t("templates.noPermission")}{" "}
          <Link href="/dashboard/permissions" className="font-medium underline">{t("templates.requestAccess")}</Link>.
        </Notice>
      )}

      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            canEdit={canEdit}
          />
        ))}
      </div>

      <div className="rounded-lg border bg-card shadow-sm p-6">
        <h2 className="mb-3 text-lg font-semibold">{t("templates.variablesTitle")}</h2>
        <p className="mb-3 text-sm text-gray-500">
          {t("templates.variablesDescription")}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-start">
                <th className="px-4 py-3 font-medium">{t("templates.variable")}</th>
                <th className="px-4 py-3 font-medium">{t("templates.variableDescription")}</th>
                <th className="px-4 py-3 font-medium">{t("templates.availableIn")}</th>
              </tr>
            </thead>
            <tbody>
              {VARIABLES.map((v) => (
                <tr key={v.variable} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-blue-600">{v.variable}</td>
                  <td className="px-4 py-3 text-gray-600">{t(v.descriptionKey)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {v.types.map((type) => t(TYPE_LABEL_KEYS[type])).join(", ")}
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
