"use client"

import { useState, useEffect, Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Upload,
  Users,
  CalendarClock,
  Cake,
  FileText,
  Megaphone,
  UserCog,
  MessageSquare,
  Ban,
  Settings,
  KeyRound,
  LogOut,
  Menu,
  X,
} from "lucide-react"
import { signOut } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

interface SidebarProps {
  role: string
  fullName?: string | null
  companyName?: string | null
  canPrepareBroadcast?: boolean
  pendingPermissionCount?: number
}

const NAV_ITEMS: {
  href: string
  label: TranslationKey
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/dashboard/upload", label: "nav.upload", icon: Upload, adminOnly: true },
  { href: "/dashboard/customers", label: "nav.customers", icon: Users },
  { href: "/dashboard/expiries", label: "nav.expiries", icon: CalendarClock },
  { href: "/dashboard/birthdays", label: "nav.birthdays", icon: Cake },
  { href: "/dashboard/templates", label: "nav.templates", icon: FileText },
  { href: "/dashboard/broadcast", label: "nav.broadcast", icon: Megaphone, adminOnly: true },
  { href: "/dashboard/staff", label: "nav.staff", icon: UserCog, adminOnly: true },
  { href: "/dashboard/messages", label: "nav.messages", icon: MessageSquare },
  { href: "/dashboard/opt-outs", label: "nav.optOuts", icon: Ban },
  { href: "/dashboard/settings", label: "nav.settings", icon: Settings },
  { href: "/dashboard/permissions", label: "nav.permissions", icon: KeyRound },
]

export default function DashboardSidebar({
  role,
  fullName,
  companyName,
  canPrepareBroadcast,
  pendingPermissionCount = 0,
}: SidebarProps) {
  const pathname = usePathname()
  const { direction, t } = useLanguage()
  const [mobileOpen, setMobileOpen] = useState(false)

  function close() {
    setMobileOpen(false)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileOpen) {
        close()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [mobileOpen])

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.adminOnly) return true
    if (role === "company_admin") return true
    if (item.href === "/dashboard/broadcast" && canPrepareBroadcast) return true
    return false
  })

  const firstAdminIdx = visibleItems.findIndex((item) => item.adminOnly)
  const lastAdminIdx = visibleItems.findLastIndex((item) => item.adminOnly)

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={close}
        />
      )}

      {/* Hamburger button (mobile only) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMobileOpen(true)}
        className={`fixed top-3 z-20 bg-white shadow-md md:hidden ${direction === "rtl" ? "right-3" : "left-3"}`}
        aria-label={t("nav.open")}
      >
        <Menu size={20} />
      </Button>

      {/* Sidebar */}
      <nav
        aria-label={t("nav.main")}
        className={`
          fixed inset-y-0 z-40 flex w-56 flex-col bg-gray-50 p-4 transition-transform duration-200 ease-in-out
          md:relative md:z-auto md:w-56 md:translate-x-0
          ${direction === "rtl" ? "right-0 border-l" : "left-0 border-r"}
          ${mobileOpen ? "translate-x-0" : direction === "rtl" ? "translate-x-full" : "-translate-x-full"}
        `}
      >
        <div className="mb-6">
          <div className="text-lg font-bold">Insurance SaaS</div>
          <div className="text-xs text-muted-foreground capitalize">
            {role === "company_admin" ? t("role.company_admin") : role === "staff" ? t("role.staff") : role}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          className={`absolute top-3 md:hidden ${direction === "rtl" ? "left-3" : "right-3"}`}
          aria-label={t("nav.close")}
        >
          <X size={20} />
        </Button>

        <div className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const active = isActive(item.href)
            const isAdminItem = item.adminOnly
            const showPermissionBadge =
              role === "company_admin"
              && item.href === "/dashboard/permissions"
              && pendingPermissionCount > 0
            return (
              <Fragment key={item.href}>
                {isAdminItem && visibleItems.indexOf(item) === firstAdminIdx && firstAdminIdx >= 0 && (
                  <div className="border-t my-2" />
                )}
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? `bg-accent text-accent-foreground font-semibold ${direction === "rtl" ? "border-r-2" : "border-l-2"} border-primary`
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <item.icon size={16} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                  {showPermissionBadge && (
                    <span
                      className="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white"
                      aria-label={`${pendingPermissionCount} ${t("nav.permissions")}`}
                    >
                      {pendingPermissionCount > 99 ? "99+" : pendingPermissionCount}
                    </span>
                  )}
                </Link>
                {isAdminItem && visibleItems.indexOf(item) === lastAdminIdx && lastAdminIdx >= 0 && (
                  <div className="border-t my-2" />
                )}
              </Fragment>
            )
          })}
        </div>

        {/* User area */}
        <div className="mt-auto border-t pt-4">
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {fullName?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{fullName || t("common.user")}</div>
              <div className="truncate text-xs text-muted-foreground capitalize">
                {role === "company_admin" ? t("role.company_admin") : role === "staff" ? t("role.staff") : role}
              </div>
            </div>
            <form action={signOut}>
              <Button
                variant="ghost"
                size="icon"
                type="submit"
                aria-label={t("common.signOut")}
              >
                <LogOut size={16} aria-hidden="true" />
              </Button>
            </form>
          </div>
          {companyName && (
            <div className="mt-2 truncate px-1 text-xs text-muted-foreground">
              {companyName}
            </div>
          )}
        </div>
      </nav>
    </>
  )
}
