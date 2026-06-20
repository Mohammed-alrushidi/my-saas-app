"use server"

import { getProfile } from "@/lib/supabase/queries"

export async function getCurrentRole(): Promise<string | null> {
  const profile = await getProfile()
  return profile?.role ?? null
}
