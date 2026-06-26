import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import { can, type ProfileLike } from "@/lib/supabase/permissions"
import DashboardSidebar from "@/components/dashboard-sidebar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let profile
  try {
    profile = await getProfile()
  } catch {
    // getProfile can fail during automatic RSC re-render triggered by cookie
    // modification in a server action. Fall through to redirect below.
  }

  if (!profile) {
    redirect("/login")
  }

  if (profile.role === "super_admin") {
    redirect("/super-admin/companies")
  }

  const canPrepareBroadcast = await can(profile as ProfileLike, "broadcast:create")

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar
        role={profile.role}
        fullName={profile.full_name || profile.email || null}
        companyName={(profile.companies as { name?: string } | null)?.name ?? null}
        canPrepareBroadcast={canPrepareBroadcast}
      />

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
