"use client"

import { useState, useEffect, useCallback } from "react"
import { listOptOuts, addOptOut, removeOptOut } from "./actions"
import { getCurrentRole } from "../role-actions"
import { Notice } from "@/components/ui/notice"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Search, PhoneOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"
import type { OptOutData } from "./actions"

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

const OPT_OUT_ERROR_KEYS: Record<string, TranslationKey> = {
  "No company assigned": "optOuts.errorNoCompany",
  "Only admins can manage opt-outs": "optOuts.errorAdminOnly",
  "Mobile number is required": "optOuts.errorRequired",
  "Invalid mobile number format": "optOuts.errorInvalid",
  "Mobile number is already opted out": "optOuts.errorDuplicate",
  "Opt-out entry not found": "optOuts.errorNotFound",
}

const SOURCE_KEYS: Record<string, TranslationKey> = {
  manual: "optOuts.sourceManual",
  inbound_stop: "optOuts.sourceInboundStop",
}

function translateOptOutError(message: string | undefined, t: Translate): string {
  if (!message) return t("optOuts.errorGeneric")
  return t(OPT_OUT_ERROR_KEYS[message] ?? "optOuts.errorGeneric")
}

export default function OptOutsPage() {
  const { locale, t } = useLanguage()
  const localeTag = locale === "ar" ? "ar-OM" : "en-GB"
  const [optOuts, setOptOuts] = useState<OptOutData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [newMobile, setNewMobile] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<OptOutData | null>(null)
  const [removing, setRemoving] = useState(false)
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const fetchOptOuts = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const data = await listOptOuts(q || undefined)
      setOptOuts(data)
    } catch {
      setNotification({ type: "error", message: t("optOuts.errorLoad") })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    let active = true
    Promise.all([getCurrentRole(), listOptOuts()])
      .then(([role, data]) => {
        if (!active) return
        setIsAdmin(role === "company_admin")
        setOptOuts(data)
      })
      .catch(() => {
        if (active) setNotification({ type: "error", message: t("optOuts.errorLoad") })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [t])

  function handleSearch() {
    fetchOptOuts(search)
  }

  async function handleAdd() {
    if (!newMobile.trim()) return
    const result = await addOptOut(newMobile.trim())
    if (result.success) {
      setNewMobile("")
      setShowAddForm(false)
      setNotification({ type: "success", message: t("optOuts.added") })
      fetchOptOuts(search)
    } else {
      setNotification({ type: "error", message: translateOptOutError(result.error, t) })
    }
  }

  function requestRemove(target: OptOutData) {
    setRemoveTarget(target)
  }

  async function handleConfirmRemove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      const result = await removeOptOut(removeTarget.id)
      if (result.success) {
        setNotification({ type: "success", message: t("optOuts.removed") })
        setRemoveTarget(null)
        fetchOptOuts(search)
      } else {
        setNotification({ type: "error", message: translateOptOutError(result.error, t) })
      }
    } catch {
      setNotification({ type: "error", message: t("optOuts.errorGeneric") })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("optOuts.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("optOuts.description")}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddForm(true)}>
            {t("optOuts.addOptOut")}
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:p-6">
          <input
            type="text"
            value={newMobile}
            onChange={(e) => setNewMobile(e.target.value)}
            placeholder={t("optOuts.mobilePlaceholder")}
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <Button onClick={handleAdd}>
            {t("optOuts.add")}
          </Button>
          <Button variant="outline" onClick={() => { setShowAddForm(false); setNewMobile("") }}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={t("optOuts.searchPlaceholder")}
          className="max-w-xs rounded border px-3 py-2 text-sm"
        />
        <Button variant="outline" onClick={handleSearch}>
          {t("optOuts.search")}
        </Button>
      </div>

      {notification && (
        <Notice
          variant={notification.type === "success" ? "success" : "error"}
          dismissible
          onDismiss={() => setNotification(null)}
          className="mb-4"
        >
          {notification.message}
        </Notice>
      )}

      {loading ? (
        <p className="text-gray-500">{t("optOuts.loading")}</p>
      ) : optOuts.length === 0 ? (
        <EmptyState
          icon={search ? Search : PhoneOff}
          title={search ? t("optOuts.noMatches") : t("optOuts.empty")}
          description={search ? undefined : t("optOuts.emptyDescription")}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-start">
                <th className="px-4 py-3 font-medium">{t("optOuts.mobile")}</th>
                <th className="px-4 py-3 font-medium">{t("optOuts.source")}</th>
                <th className="px-4 py-3 font-medium">{t("optOuts.date")}</th>
                <th className="px-4 py-3 font-medium">{t("optOuts.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {optOuts.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{o.mobile_no}</td>
                  <td className="px-4 py-3">{SOURCE_KEYS[o.source] ? t(SOURCE_KEYS[o.source]) : o.source}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(o.opted_out_at).toLocaleDateString(localeTag)}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <Button variant="destructive" size="sm" onClick={() => requestRemove(o)}>
                        {t("optOuts.remove")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={t("optOuts.removeTitle")}
        message={removeTarget ? t("optOuts.removeMessage", { mobile: removeTarget.mobile_no }) : ""}
        confirmLabel={removing ? t("optOuts.working") : t("optOuts.remove")}
        confirmDisabled={removing}
        variant="danger"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  )
}
