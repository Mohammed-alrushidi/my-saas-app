"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProfile } from "@/lib/supabase/queries"

export type StaffMember = {
  id: string
  email: string | null
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

export async function listStaff(): Promise<StaffMember[]> {
  const profile = await getProfile()
  if (!profile?.company_id) return []
  if (profile.role !== "company_admin") return []

  const supabase = await createClient()

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at")
    .eq("company_id", profile.company_id)
    .eq("role", "staff")
    .order("created_at", { ascending: false })

  return data ?? []
}

export async function inviteStaff(
  email: string,
  fullName: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can invite staff" }

  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedEmail) return { success: false, error: "Email is required" }

  const trimmedName = fullName.trim()
  if (!trimmedName) return { success: false, error: "Full name is required" }

  const adminSupabase = createAdminClient()

  const tempPassword = crypto.randomUUID().slice(0, 12)

  const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
    email: trimmedEmail,
    password: tempPassword,
    email_confirm: true,
  })

  if (authError) {
    if (authError.message?.includes("already exists")) {
      const { data: existingUsers } = await adminSupabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users.find((u) => u.email === trimmedEmail)

      if (!existingUser) return { success: false, error: "User already exists but could not be found" }

      const { data: existingProfile } = await adminSupabase
        .from("profiles")
        .select("id, company_id, role, is_active")
        .eq("id", existingUser.id)
        .single()

      if (!existingProfile) return { success: false, error: "User profile not found" }

      if (existingProfile.company_id !== profile.company_id) {
        return { success: false, error: "This email belongs to another company" }
      }

      if (existingProfile.role !== "staff") {
        return { success: false, error: "Cannot invite a company admin or super admin as staff" }
      }

      if (existingProfile.is_active) {
        return { success: false, error: "This user is already an active staff member" }
      }

      const { error: updateError } = await adminSupabase
        .from("profiles")
        .update({ is_active: true, full_name: trimmedName })
        .eq("id", existingUser.id)

      if (updateError) return { success: false, error: updateError.message }

      const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/update-password`
      const { error: reEmailError } = await adminSupabase.auth.resetPasswordForEmail(
        trimmedEmail,
        { redirectTo },
      )

      if (reEmailError) return { success: false, error: reEmailError.message }

      revalidatePath("/dashboard/staff")
      return { success: true }
    }

    return { success: false, error: authError.message }
  }

  if (!authUser?.user) return { success: false, error: "Failed to create user" }

  const { error: profileError } = await adminSupabase
    .from("profiles")
    .update({
      company_id: profile.company_id,
      full_name: trimmedName,
      is_active: true,
    })
    .eq("id", authUser.user.id)

  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(authUser.user.id).catch(() => {})
    return { success: false, error: profileError.message }
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/update-password`
  const { error: emailError } = await adminSupabase.auth.resetPasswordForEmail(
    trimmedEmail,
    { redirectTo },
  )

  if (emailError) {
    await adminSupabase.auth.admin.deleteUser(authUser.user.id).catch(() => {})
    return { success: false, error: emailError.message }
  }

  revalidatePath("/dashboard/staff")
  return { success: true }
}

export type StaffWithGrants = {
  id: string
  full_name: string | null
  role: string
  is_active: boolean
  grants: {
    id: string
    permission: string
    granted_at: string
  }[]
}

export async function getCompanyStaffGrants(): Promise<StaffWithGrants[]> {
  const profile = await getProfile()
  if (!profile?.company_id) return []
  if (profile.role !== "company_admin") return []

  const supabase = await createClient()

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("company_id", profile.company_id)
    .eq("role", "staff")

  if (!staff || staff.length === 0) return []

  const staffIds = staff.map((s) => s.id)

  const { data: grants } = await supabase
    .from("staff_permission_grants")
    .select("id, staff_id, permission, granted_at")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .in("staff_id", staffIds)

  const grantsByStaffId: Record<string, { id: string; permission: string; granted_at: string }[]> = {}
  if (grants) {
    for (const g of grants) {
      if (!grantsByStaffId[g.staff_id]) grantsByStaffId[g.staff_id] = []
      grantsByStaffId[g.staff_id].push({
        id: g.id,
        permission: g.permission,
        granted_at: g.granted_at,
      })
    }
  }

  return staff.map((s) => ({
    id: s.id,
    full_name: s.full_name,
    role: s.role,
    is_active: s.is_active,
    grants: grantsByStaffId[s.id] ?? [],
  }))
}

export async function revokeStaffPermission(
  grantId: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: "Authentication required" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can revoke permissions" }
  if (profile.is_active !== true) return { success: false, error: "Account is not active" }
  if (!profile.company_id) return { success: false, error: "No company assigned" }

  const supabase = await createClient()

  const { data: grant } = await supabase
    .from("staff_permission_grants")
    .select("id, company_id, is_active")
    .eq("id", grantId)
    .single()

  if (!grant) return { success: false, error: "Permission grant not found" }
  if (grant.company_id !== profile.company_id) return { success: false, error: "Permission grant not found" }
  if (grant.is_active !== true) return { success: false, error: "Permission grant is already revoked" }

  const { error } = await supabase
    .from("staff_permission_grants")
    .update({
      is_active: false,
      revoked_by: profile.id,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", grantId)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/staff")
  return { success: true }
}

export async function deactivateStaff(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can manage staff" }

  if (userId === profile.id) return { success: false, error: "You cannot deactivate yourself" }

  const supabase = await createClient()

  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", userId)
    .single()

  if (!target) return { success: false, error: "User not found" }
  if (target.company_id !== profile.company_id) return { success: false, error: "User is not in your company" }
  if (target.role !== "staff") return { success: false, error: "Only staff members can be deactivated" }

  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/staff")
  return { success: true }
}

export async function activateStaff(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can manage staff" }

  const supabase = await createClient()

  const { data: target } = await supabase
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", userId)
    .single()

  if (!target) return { success: false, error: "User not found" }
  if (target.company_id !== profile.company_id) return { success: false, error: "User is not in your company" }
  if (target.role !== "staff") return { success: false, error: "Only staff members can be activated" }

  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase
    .from("profiles")
    .update({ is_active: true })
    .eq("id", userId)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/staff")
  return { success: true }
}
