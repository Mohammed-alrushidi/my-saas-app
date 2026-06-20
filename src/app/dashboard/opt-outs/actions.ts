"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile, getOptOuts } from "@/lib/supabase/queries"

function cleanMobile(raw: string): string {
  return raw.replace(/[\s\-\(\)\+]/g, "")
}

function isValidMobile(mobile: string): boolean {
  const cleaned = mobile.replace(/[\s\-\(\)\+]/g, "")
  return /^\d{7,15}$/.test(cleaned)
}

export type OptOutData = {
  id: string
  company_id: string
  mobile_no: string
  source: string
  opted_out_at: string
}

export async function listOptOuts(search?: string): Promise<OptOutData[]> {
  return await getOptOuts(search)
}

export async function addOptOut(
  mobile: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can manage opt-outs" }

  const normalized = cleanMobile(mobile.trim())
  if (!normalized) return { success: false, error: "Mobile number is required" }
  if (!isValidMobile(normalized)) return { success: false, error: "Invalid mobile number format" }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("opt_outs")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("mobile_no", normalized)
    .maybeSingle()

  if (existing) return { success: false, error: "Mobile number is already opted out" }

  const { error: insertError } = await supabase
    .from("opt_outs")
    .insert({ company_id: profile.company_id, mobile_no: normalized, source: "company_added" })

  if (insertError) return { success: false, error: insertError.message }

  const { error: updateError } = await supabase
    .from("customer_records")
    .update({ communication_status: "opted_out" })
    .eq("company_id", profile.company_id)
    .eq("mobile_no", normalized)

  if (updateError) return { success: false, error: updateError.message }

  revalidatePath("/dashboard/opt-outs")
  return { success: true }
}

export async function removeOptOut(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only admins can manage opt-outs" }

  const supabase = await createClient()

  const { data: optOut } = await supabase
    .from("opt_outs")
    .select("mobile_no")
    .eq("id", id)
    .eq("company_id", profile.company_id)
    .single()

  if (!optOut) return { success: false, error: "Opt-out entry not found" }

  const { error: deleteError } = await supabase
    .from("opt_outs")
    .delete()
    .eq("id", id)
    .eq("company_id", profile.company_id)

  if (deleteError) return { success: false, error: deleteError.message }

  const { error: updateError } = await supabase
    .from("customer_records")
    .update({ communication_status: "allowed" })
    .eq("company_id", profile.company_id)
    .eq("mobile_no", optOut.mobile_no)
    .eq("communication_status", "opted_out")

  if (updateError) return { success: false, error: updateError.message }

  revalidatePath("/dashboard/opt-outs")
  return { success: true }
}
