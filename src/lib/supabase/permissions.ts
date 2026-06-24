import { createClient } from "@/lib/supabase/server"
import { COMPANY_PERMISSIONS, type CompanyPermission } from "@/lib/permission-types"
export { COMPANY_PERMISSIONS }
export type { CompanyPermission }

export interface ProfileLike {
  id: string
  company_id: string | null
  role: string
  is_active: boolean
}

export async function can(
  profile: ProfileLike | null,
  permission: string,
): Promise<boolean> {
  if (!COMPANY_PERMISSIONS.includes(permission as CompanyPermission)) {
    return false
  }

  if (!profile) return false
  if (!profile.is_active) return false

  if (profile.role === "company_admin") return true
  if (profile.role === "super_admin") return false

  if (profile.role === "staff") {
    if (!profile.company_id) return false

    const supabase = await createClient()
    const { data } = await supabase
      .from("staff_permission_grants")
      .select("id")
      .eq("company_id", profile.company_id)
      .eq("staff_id", profile.id)
      .eq("permission", permission)
      .eq("is_active", true)
      .maybeSingle()

    return data !== null
  }

  return false
}
