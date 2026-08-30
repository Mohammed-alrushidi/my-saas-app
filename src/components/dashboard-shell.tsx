"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import DashboardSidebar from "@/components/dashboard-sidebar"
import DashboardNotificationBell from "@/components/dashboard-notification-bell"
import {
  getPendingPermissionSummary,
  type PendingPermissionSummary,
} from "@/app/dashboard/permissions/actions"

type DashboardShellProps = {
  children: React.ReactNode
  role: string
  fullName: string | null
  companyName: string | null
  canPrepareBroadcast: boolean
  initialPermissionSummary: PendingPermissionSummary | null
}

export default function DashboardShell({
  children,
  role,
  fullName,
  companyName,
  canPrepareBroadcast,
  initialPermissionSummary,
}: DashboardShellProps) {
  const pathname = usePathname()
  const [permissionSummary, setPermissionSummary] = useState(initialPermissionSummary)

  useEffect(() => {
    if (role !== "company_admin") return

    let active = true
    async function refreshSummary() {
      const nextSummary = await getPendingPermissionSummary()
      if (active) setPermissionSummary(nextSummary)
    }

    function handlePermissionUpdate() {
      void refreshSummary()
    }

    void refreshSummary()
    const intervalId = window.setInterval(refreshSummary, 30_000)
    window.addEventListener("permission-requests-updated", handlePermissionUpdate)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener("permission-requests-updated", handlePermissionUpdate)
    }
  }, [pathname, role])

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar
        role={role}
        fullName={fullName}
        companyName={companyName}
        canPrepareBroadcast={canPrepareBroadcast}
        pendingPermissionCount={permissionSummary?.count ?? 0}
      />

      <div className="min-w-0 flex-1">
        {role === "company_admin" && (
          <header className="sticky top-0 z-20 flex h-14 items-center justify-end border-b bg-white/95 px-4 backdrop-blur md:px-6">
            <DashboardNotificationBell summary={permissionSummary} />
          </header>
        )}
        <main>{children}</main>
      </div>
    </div>
  )
}
