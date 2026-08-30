import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import { can, type ProfileLike } from "@/lib/supabase/permissions"
import DashboardShell from "@/components/dashboard-shell"
import { getPendingPermissionSummary } from "./permissions/actions"

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
  const initialPermissionSummary = profile.role === "company_admin"
    ? await getPendingPermissionSummary()
    : null

  return (
    <DashboardShell
      role={profile.role}
      fullName={profile.full_name || profile.email || null}
      companyName={(profile.companies as { name?: string } | null)?.name ?? null}
      canPrepareBroadcast={canPrepareBroadcast}
      initialPermissionSummary={initialPermissionSummary}
    >
      {children}
    </DashboardShell>
  )
}
