"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getProfile } from "@/lib/supabase/queries"

export async function createCompany(formData: FormData) {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "super_admin") redirect("/dashboard")

  const name = formData.get("name") as string
  const domain = formData.get("domain") as string
  const adminEmail = formData.get("admin_email") as string
  const adminName = formData.get("admin_name") as string

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({ name, domain })
    .select()
    .single()

  if (companyError) {
    redirect(`/super-admin/companies?error=${encodeURIComponent(companyError.message)}`)
  }

  const tempPassword = crypto.randomUUID().slice(0, 12)

  const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { company_id: company.id, role: "company_admin" },
  })

  if (authError) {
    // If user already exists, link them to the company instead
    if (authError.message?.includes("already exists")) {
      const { data: existingUsers } = await adminSupabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users.find((u) => u.email === adminEmail)
      if (existingUser) {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("company_id, full_name")
          .eq("id", existingUser.id)
          .single()

        if (existingProfile?.company_id) {
          redirect(`/super-admin/companies?error=${encodeURIComponent("This user already belongs to another company")}`)
        }

        await supabase
          .from("profiles")
          .update({
            company_id: company.id,
            role: "company_admin",
            full_name: adminName,
          })
          .eq("id", existingUser.id)

        await adminSupabase.auth.admin.updateUserById(existingUser.id, {
          user_metadata: { company_id: company.id, role: "company_admin" },
        })

        revalidatePath("/super-admin/companies")
        redirect(`/super-admin/companies?created=true`)
      }
    }
    redirect(`/super-admin/companies?error=${encodeURIComponent(authError.message)}`)
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      company_id: company.id,
      role: "company_admin",
      full_name: adminName,
    })
    .eq("id", authUser.user.id)

  if (profileError) {
    redirect(`/super-admin/companies?error=${encodeURIComponent(profileError.message)}`)
  }

  // Send password reset email so the admin can set their own password
  await adminSupabase.auth.resetPasswordForEmail(adminEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/login`,
  })

  revalidatePath("/super-admin/companies")
  redirect(`/super-admin/companies?created=true`)
}

export async function toggleCompanyStatus(formData: FormData) {
  const supabase = await createClient()

  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "super_admin") redirect("/dashboard")

  const companyId = formData.get("company_id") as string
  const isActive = formData.get("is_active") === "true"

  const { error } = await supabase
    .from("companies")
    .update({ is_active: isActive })
    .eq("id", companyId)

  if (error) {
    redirect(`/super-admin/companies?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath("/super-admin/companies")
  redirect("/super-admin/companies")
}
