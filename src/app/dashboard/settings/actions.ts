"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile, getReminderSettings } from "@/lib/supabase/queries"
import { can, type ProfileLike } from "@/lib/supabase/permissions"

const ALLOWED_DAYS = [7, 14, 30] as const

export type SettingsData = {
  id: string
  company_id: string
  reminder_days: number[]
  is_active: boolean
}

export async function getSettings(): Promise<SettingsData | null> {
  return await getReminderSettings()
}

export async function saveSettings(
  reminderDays: number[],
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!await can(profile as ProfileLike, "reminder_settings:edit")) {
    return { success: false, error: "You don't have permission to edit settings" }
  }

  const invalidDays = reminderDays.filter((d) => !ALLOWED_DAYS.includes(d as typeof ALLOWED_DAYS[number]))
  if (invalidDays.length > 0) {
    return { success: false, error: `Invalid reminder days: ${invalidDays.join(", ")}` }
  }

  if (isActive && reminderDays.length === 0) {
    return { success: false, error: "At least one reminder day must be selected when active" }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("reminder_settings")
    .update({ reminder_days: reminderDays, is_active: isActive })
    .eq("company_id", profile.company_id)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/settings")
  return { success: true }
}

export async function resetSettings(): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!await can(profile as ProfileLike, "reminder_settings:edit")) {
    return { success: false, error: "You don't have permission to edit settings" }
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from("reminder_settings")
    .update({ reminder_days: [30, 14, 7], is_active: true })
    .eq("company_id", profile.company_id)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/settings")
  return { success: true }
}
