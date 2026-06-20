import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeftToLine } from "lucide-react"
import { SuperAdminSidebarNav } from "./sidebar-nav"
import { SuperAdminLogoutButton } from "@/components/super-admin-logout-button"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  if (profile.role !== "super_admin") {
    redirect("/dashboard")
  }

  const fullName = profile.full_name || profile.email || null
  const companyName = (profile.companies as { name?: string } | null)?.name ?? null

  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Super admin navigation"
        className="flex w-56 flex-col border-r bg-gray-50 p-4"
      >
        <div className="mb-6">
          <div className="text-lg font-bold">Insurance SaaS</div>
          <div className="text-xs text-muted-foreground">Super Admin</div>
        </div>

        <SuperAdminSidebarNav />

        <div className="mt-auto border-t pt-4">
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {fullName?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{fullName || "User"}</div>
              <div className="truncate text-xs text-muted-foreground">Super Admin</div>
            </div>
            <SuperAdminLogoutButton />
          </div>
          {companyName && (
            <div className="mt-2 truncate px-1 text-xs text-muted-foreground">{companyName}</div>
          )}

          <div className="mt-4 pt-4 border-t">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeftToLine size={16} className="shrink-0" aria-hidden="true" />
              Switch to dashboard
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  )
}
