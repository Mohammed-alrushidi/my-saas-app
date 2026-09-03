"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PendingPermissionSummary } from "@/app/dashboard/permissions/actions"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

const PERMISSION_LABELS: Record<string, TranslationKey> = {
  "templates:edit": "permission.templates",
  "reminder_settings:edit": "permission.reminders",
  "broadcast:create": "permission.broadcast",
  "birthday:send": "permission.birthdaySend",
}

function formatCreatedAt(value: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-OM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Muscat",
  }).format(new Date(value))
}

export default function DashboardNotificationBell({
  summary,
}: {
  summary: PendingPermissionSummary | null
}) {
  const [open, setOpen] = useState(false)
  const { direction, locale, t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const count = summary?.count ?? 0

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon-lg"
        onClick={() => setOpen((current) => !current)}
        aria-label={count > 0 ? `${t("notifications.label")}: ${count}` : t("notifications.label")}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative rounded-full"
      >
        <Bell aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      {open && (
        <section
          role="dialog"
          aria-label={t("notifications.label")}
          className={`absolute top-11 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border bg-white shadow-xl ${direction === "rtl" ? "left-0" : "right-0"}`}
        >
          <div className="border-b px-4 py-3 text-start">
            <div className="font-semibold">{t("notifications.title")}</div>
            <div className="text-xs text-muted-foreground">{t("notifications.description")}</div>
          </div>

          {summary === null ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("notifications.error")}
            </p>
          ) : summary.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("notifications.empty")}
            </p>
          ) : (
            <div className="max-h-80 divide-y overflow-y-auto">
              {summary.items.map((item) => (
                <Link
                  key={item.id}
                  href="/dashboard/permissions"
                  onClick={() => setOpen(false)}
                  className="flex gap-3 px-4 py-3 text-start transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                    <KeyRound size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.staff_name || t("role.staff")} {t("notifications.request")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {PERMISSION_LABELS[item.permission] ? t(PERMISSION_LABELS[item.permission]) : item.permission}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatCreatedAt(item.created_at, locale)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          <Link
            href="/dashboard/permissions"
            onClick={() => setOpen(false)}
            className="block border-t px-4 py-3 text-center text-sm font-medium text-primary hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            {t("notifications.viewAll")}
          </Link>
        </section>
      )}
    </div>
  )
}
