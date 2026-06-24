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

interface SidebarProps {
  role: string
  fullName?: string | null
  companyName?: string | null
}

const NAV_ITEMS: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/upload", label: "Upload Excel", icon: Upload, adminOnly: true },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/expiries", label: "Upcoming Expiries", icon: CalendarClock },
  { href: "/dashboard/birthdays", label: "Birthdays", icon: Cake },
  { href: "/dashboard/templates", label: "Message Templates", icon: FileText },
  { href: "/dashboard/broadcast", label: "Broadcast Message", icon: Megaphone, adminOnly: true },
  { href: "/dashboard/staff", label: "Staff", icon: UserCog, adminOnly: true },
  { href: "/dashboard/messages", label: "Message History", icon: MessageSquare },
  { href: "/dashboard/opt-outs", label: "Opt-Outs", icon: Ban },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/permissions", label: "Permission Requests", icon: KeyRound },
]

export default function DashboardSidebar({ role, fullName, companyName }: SidebarProps) {
  const pathname = usePathname()
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

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || role === "company_admin",
  )

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
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-20 rounded-md bg-white p-2 shadow-md md:hidden"
        aria-label="Open sidebar"
      >
        <Menu size={20} />
      </button>

      {/* Sidebar */}
      <nav
        aria-label="Main navigation"
        className={`
          fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r bg-gray-50 p-4 transition-transform duration-200 ease-in-out
          md:relative md:z-auto md:w-56 md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="mb-6">
          <div className="text-lg font-bold">Insurance SaaS</div>
          <div className="text-xs text-muted-foreground capitalize">
            {role.replace("_", " ")}
          </div>
        </div>

        <button
          onClick={close}
          className="absolute right-3 top-3 rounded-md p-1 hover:bg-gray-200 md:hidden"
          aria-label="Close sidebar"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const active = isActive(item.href)
            const isAdminItem = item.adminOnly
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
                      ? "bg-accent text-accent-foreground border-l-2 border-primary font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <item.icon size={16} className="shrink-0" aria-hidden="true" />
                  {item.label}
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
              <div className="truncate text-sm font-medium">{fullName || "User"}</div>
              <div className="truncate text-xs text-muted-foreground capitalize">
                {role.replace("_", " ")}
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Sign out"
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
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
