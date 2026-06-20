import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"

export default async function Home() {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  if (profile.role === "super_admin") {
    redirect("/super-admin/companies")
  }

  redirect("/dashboard")
}
