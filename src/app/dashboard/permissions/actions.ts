"use server"

import { revalidatePath } from "next/cache"
import { getProfile } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/server"
import { COMPANY_PERMISSIONS } from "@/lib/supabase/permissions"

const MIN_REASON = 10
const MAX_REASON = 500

export type PermissionRequestRecord = {
  id: string
  permission: string
  reason: string
  status: "pending" | "approved" | "rejected"
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export async function createPermissionRequest(
  permission: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: "Not authenticated" }
  if (!profile.company_id) return { success: false, error: "No company assigned" }
  if (!profile.is_active) return { success: false, error: "Account is inactive" }
  if (profile.role !== "staff") return { success: false, error: "Only staff can request permissions" }

  if (!COMPANY_PERMISSIONS.includes(permission as typeof COMPANY_PERMISSIONS[number])) {
    return { success: false, error: "Invalid permission" }
  }

  const trimmed = reason.trim()
  if (trimmed.length < MIN_REASON) return { success: false, error: `Reason must be at least ${MIN_REASON} characters` }
  if (trimmed.length > MAX_REASON) return { success: false, error: `Reason must be at most ${MAX_REASON} characters` }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("permission_requests")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("staff_id", profile.id)
    .eq("permission", permission)
    .eq("status", "pending")
    .maybeSingle()

  if (existing) return { success: false, error: "You already have a pending request for this permission" }

  const { error } = await supabase
    .from("permission_requests")
    .insert({
      company_id: profile.company_id,
      staff_id: profile.id,
      permission,
      reason: trimmed,
    })

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "You already have a pending request for this permission" }
    }
    return { success: false, error: error.message }
  }

  revalidatePath("/dashboard/permissions")
  return { success: true }
}

export async function getMyPermissionRequests(): Promise<PermissionRequestRecord[]> {
  const profile = await getProfile()
  if (!profile) return []

  const supabase = await createClient()

  const { data } = await supabase
    .from("permission_requests")
    .select("*")
    .eq("staff_id", profile.id)
    .order("created_at", { ascending: false })

  return data ?? []
}

// --- Phase 3: admin actions ---

export type CompanyPermissionRequest = {
  id: string
  staff_id: string
  staff_name: string | null
  permission: string
  reason: string
  status: "pending" | "approved" | "rejected"
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

async function validateAdminCompanyAccess(): Promise<
  { profile: { id: string; company_id: string } } | { error: string }
> {
  const profile = await getProfile()
  if (!profile) return { error: "Not authenticated" }
  if (!profile.company_id) return { error: "No company assigned" }
  if (!profile.is_active) return { error: "Account is inactive" }
  if (profile.role !== "company_admin") return { error: "Only company admins can perform this action" }
  return { profile: { id: profile.id, company_id: profile.company_id } }
}

export async function getCompanyPermissionRequests(): Promise<{
  pending: CompanyPermissionRequest[]
  reviewed: CompanyPermissionRequest[]
} | null> {
  const result = await validateAdminCompanyAccess()
  if ("error" in result) return null

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("permission_requests")
    .select("*, profiles!inner(full_name)")
    .eq("company_id", result.profile.company_id)
    .order("created_at", { ascending: false })

  if (error || !data) return null

  const all = data.map((r: any) => ({
    id: r.id,
    staff_id: r.staff_id,
    staff_name: r.profiles?.full_name ?? null,
    permission: r.permission,
    reason: r.reason,
    status: r.status as "pending" | "approved" | "rejected",
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    review_note: r.review_note,
    created_at: r.created_at,
  }))

  return {
    pending: all.filter((r) => r.status === "pending"),
    reviewed: all.filter((r) => r.status === "approved" || r.status === "rejected"),
  }
}

export async function approvePermissionRequest(
  requestId: string,
  reviewNote?: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await validateAdminCompanyAccess()
  if ("error" in result) return { success: false, error: result.error }

  const admin = result.profile
  const note = reviewNote?.trim() ?? null
  if (note && note.length > 500) return { success: false, error: "Review note must be at most 500 characters" }

  const supabase = await createClient()

  const { data: request, error: loadError } = await supabase
    .from("permission_requests")
    .select("*, profiles!inner(full_name, company_id, role, is_active)")
    .eq("id", requestId)
    .maybeSingle()

  if (loadError || !request) return { success: false, error: "Permission request not found" }

  if (request.status !== "pending") return { success: false, error: "This request is no longer pending" }

  if (request.company_id !== admin.company_id) return { success: false, error: "This request does not belong to your company" }

  const staffProfile = (request as any).profiles
  if (!staffProfile) return { success: false, error: "Staff member not found" }
  if (staffProfile.role !== "staff") return { success: false, error: "Cannot approve permissions for this user" }
  if (!staffProfile.is_active) return { success: false, error: "Cannot approve permissions for an inactive staff member" }
  if (staffProfile.company_id !== admin.company_id) return { success: false, error: "Staff member does not belong to your company" }

  const { data: existingGrant } = await supabase
    .from("staff_permission_grants")
    .select("id")
    .eq("company_id", admin.company_id)
    .eq("staff_id", request.staff_id)
    .eq("permission", request.permission)
    .eq("is_active", true)
    .maybeSingle()

  if (existingGrant) return { success: false, error: "Staff member already has this permission" }

  const { error: updateError } = await supabase
    .from("permission_requests")
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", requestId)

  if (updateError) return { success: false, error: updateError.message }

  const { error: insertError } = await supabase
    .from("staff_permission_grants")
    .insert({
      company_id: admin.company_id,
      staff_id: request.staff_id,
      permission: request.permission,
      granted_by: admin.id,
    })

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: false, error: "Staff member already has this permission" }
    }
    return { success: false, error: `Failed to create permission grant: ${insertError.message}` }
  }

  revalidatePath("/dashboard/permissions")
  return { success: true }
}

export async function rejectPermissionRequest(
  requestId: string,
  reviewNote?: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await validateAdminCompanyAccess()
  if ("error" in result) return { success: false, error: result.error }

  const admin = result.profile
  const note = reviewNote?.trim() ?? null
  if (note && note.length > 500) return { success: false, error: "Review note must be at most 500 characters" }

  const supabase = await createClient()

  const { data: request, error: loadError } = await supabase
    .from("permission_requests")
    .select("id, company_id, status")
    .eq("id", requestId)
    .maybeSingle()

  if (loadError || !request) return { success: false, error: "Permission request not found" }

  if (request.status !== "pending") return { success: false, error: "This request is no longer pending" }

  if (request.company_id !== admin.company_id) return { success: false, error: "This request does not belong to your company" }

  const { error: updateError } = await supabase
    .from("permission_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", requestId)

  if (updateError) return { success: false, error: updateError.message }

  revalidatePath("/dashboard/permissions")
  return { success: true }
}
