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
