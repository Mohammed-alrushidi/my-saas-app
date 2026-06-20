"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { Building2, LayoutDashboard } from "lucide-react"

const NAV_ITEMS = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/super-admin/companies", label: "Companies", icon: Building2 },
]

export function SuperAdminSidebarNav() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <div className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
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
        )
      })}
    </div>
  )
}
