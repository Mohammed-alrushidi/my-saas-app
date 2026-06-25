"use server"

import { getProfile } from "@/lib/supabase/queries"
import { can, type ProfileLike } from "@/lib/supabase/permissions"

export type DashboardCapabilities = {
  role: string
  isAdmin: boolean
  canEditTemplates: boolean
  canEditSettings: boolean
  canPrepareBroadcast: boolean
  canSendBroadcast: boolean
}

export async function getCurrentRole(): Promise<string | null> {
  const profile = await getProfile()
  return profile?.role ?? null
}

export async function getDashboardCapabilities(): Promise<DashboardCapabilities | null> {
  const profile = await getProfile()
  if (!profile) return null

  const [canEditTemplates, canEditSettings, canPrepareBroadcast] = await Promise.all([
    can(profile as ProfileLike, "templates:edit"),
    can(profile as ProfileLike, "reminder_settings:edit"),
    can(profile as ProfileLike, "broadcast:create"),
  ])

  return {
    role: profile.role,
    isAdmin: profile.role === "company_admin",
    canEditTemplates,
    canEditSettings,
    canPrepareBroadcast,
    canSendBroadcast: profile.role === "company_admin",
  }
}
