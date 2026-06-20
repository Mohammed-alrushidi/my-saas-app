import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import DashboardSidebar from "@/components/dashboard-sidebar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  if (profile.role === "super_admin") {
    redirect("/super-admin/companies")
  }

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar
        role={profile.role}
        fullName={profile.full_name || profile.email || null}
        companyName={(profile.companies as { name?: string } | null)?.name ?? null}
      />

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
