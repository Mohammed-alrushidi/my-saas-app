"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile, getCompanyTemplates } from "@/lib/supabase/queries"
import { DEFAULT_TEMPLATES } from "@/lib/constants"
import { can, type ProfileLike } from "@/lib/supabase/permissions"

export type TemplateData = {
  id: string
  template_type: "renewal" | "birthday" | "broadcast"
  name: string
  body: string
  is_default: boolean
}

export async function getTemplates(): Promise<TemplateData[]> {
  return await getCompanyTemplates()
}

export async function saveTemplate(
  templateId: string,
  body: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!await can(profile as ProfileLike, "templates:edit")) {
    return { success: false, error: "You don't have permission to edit templates" }
  }

  const trimmedBody = body.trim()
  if (!trimmedBody) return { success: false, error: "Template body cannot be empty" }

  const supabase = await createClient()

  const { error } = await supabase
    .from("message_templates")
    .update({ body: trimmedBody, name: name.trim(), is_default: false })
    .eq("id", templateId)
    .eq("company_id", profile.company_id)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/templates")
  return { success: true }
}

export async function resetTemplate(
  templateType: "renewal" | "birthday" | "broadcast",
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (!await can(profile as ProfileLike, "templates:edit")) {
    return { success: false, error: "You don't have permission to edit templates" }
  }

  const def = DEFAULT_TEMPLATES[templateType]
  if (!def) return { success: false, error: "Invalid template type" }

  const supabase = await createClient()

  const { error } = await supabase
    .from("message_templates")
    .update({ body: def.body, name: def.name, is_default: true })
    .eq("company_id", profile.company_id)
    .eq("template_type", templateType)

  if (error) return { success: false, error: error.message }

  revalidatePath("/dashboard/templates")
  return { success: true }
}
