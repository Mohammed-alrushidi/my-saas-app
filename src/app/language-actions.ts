"use server"

import { createClient } from "@/lib/supabase/server"
import { isLocale, type Locale } from "@/lib/i18n"
import { setLocaleCookie } from "@/lib/i18n/server"

export async function setLocalePreference(
  value: string,
): Promise<{ success: boolean; locale?: Locale; error?: string }> {
  if (!isLocale(value)) return { success: false, error: "unsupported_locale" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { error } = await supabase.auth.updateUser({ data: { locale: value } })
    if (error) return { success: false, error: "preference_update_failed" }
  }

  await setLocaleCookie(value)
  return { success: true, locale: value }
}
