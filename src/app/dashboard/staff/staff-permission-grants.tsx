"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { revokeStaffPermission } from "./actions"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

const PERMISSION_LABELS: Record<string, TranslationKey> = {
  "templates:edit": "permission.templates",
  "reminder_settings:edit": "permission.reminders",
  "broadcast:create": "permission.broadcast",
  "birthday:send": "permission.birthdaySend",
}

export interface StaffPermissionGrant {
  id: string
  permission: string
  granted_at: string
}

interface Props {
  grants: StaffPermissionGrant[]
  staffName: string
  staffIsActive: boolean
  onRevoke: () => void
}

export default function StaffPermissionGrants({ grants, staffName, staffIsActive, onRevoke }: Props) {
  const { locale, t } = useLanguage()
  const router = useRouter()
  const [revokingGrant, setRevokingGrant] = useState<StaffPermissionGrant | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRevoke() {
    if (!revokingGrant) return
    setRevoking(true)
    setError(null)
    const result = await revokeStaffPermission(revokingGrant.id)
    setRevoking(false)
    if (result.success) {
      setRevokingGrant(null)
      router.refresh()
      onRevoke()
    } else {
      setError(result.error ?? "Failed to revoke permission")
    }
  }

  if (grants.length === 0) {
    return <p className="text-xs text-gray-400">{locale === "ar" ? "لا توجد صلاحيات نشطة" : "No active permissions"}</p>
  }

  return (
    <>
      <div className="space-y-1.5">
        {!staffIsActive && (
          <p className="text-xs text-amber-600">{locale === "ar" ? "هذا الموظف معطّل حاليًا." : "This employee is currently disabled."}</p>
        )}
        {grants.map((g) => (
          <div key={g.id} className="flex items-center gap-1.5">
            <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {PERMISSION_LABELS[g.permission] ? t(PERMISSION_LABELS[g.permission]) : g.permission}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevokingGrant(g)}
              aria-label={`${locale === "ar" ? "تعطيل" : "Disable"} ${PERMISSION_LABELS[g.permission] ? t(PERMISSION_LABELS[g.permission]) : g.permission} · ${staffName}`}
            >
              {locale === "ar" ? "تعطيل الصلاحية" : "Disable permission"}
            </Button>
          </div>
        ))}
      </div>

      {revokingGrant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold">
              {locale === "ar" ? "تعطيل صلاحية" : "Disable permission"} {PERMISSION_LABELS[revokingGrant.permission] ? t(PERMISSION_LABELS[revokingGrant.permission]) : revokingGrant.permission}؟
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              {locale === "ar" ? `سيتم تعطيل هذه الصلاحية للموظف ${staffName} فورًا، من دون تعطيل حسابه أو حذف بياناته.` : `This permission will be disabled for ${staffName} without disabling the account or deleting data.`}
            </p>
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setRevokingGrant(null); setError(null) }}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={revoking}>
                {revoking ? t("common.loading") : locale === "ar" ? "تعطيل الصلاحية" : "Disable permission"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
