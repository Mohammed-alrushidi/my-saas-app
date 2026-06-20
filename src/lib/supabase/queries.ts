import { createClient } from "@/lib/supabase/server"

export async function getProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, companies(*)")
    .eq("id", user.id)
    .single()

  return profile
}

export async function getCompanies() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })

  return data ?? []
}

export async function getCompany(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single()

  return data
}

export async function getCompanyProfiles(companyId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("company_id", companyId)

  return data ?? []
}

export async function getCompanyImports() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  const { data } = await supabase
    .from("imports")
    .select("*")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(20)

  return data ?? []
}

export async function getImportErrors(importId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("import_errors")
    .select("*")
    .eq("import_id", importId)
    .order("row_number", { ascending: true })

  return data ?? []
}

export async function getCustomerRecords() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  const { data } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })

  return data ?? []
}

export async function getCustomerRecordsCount() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return 0

  const { count } = await supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)

  return count ?? 0
}

export async function getActiveCustomerCount() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return 0

  const { count } = await supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)
    .eq("communication_status", "allowed")

  return count ?? 0
}

export async function getUpcomingExpiries(days: number, limit = 50) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  const now = new Date()
  const future = new Date(now.getTime() + days * 86400000)
  const todayStr = now.toISOString().split("T")[0]
  const futureStr = future.toISOString().split("T")[0]

  const { data } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .gte("policy_expiry_date", todayStr)
    .lte("policy_expiry_date", futureStr)
    .order("policy_expiry_date", { ascending: true })
    .limit(limit)

  return data ?? []
}

export async function getExpiriesCount(days: number) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return 0

  const now = new Date()
  const future = new Date(now.getTime() + days * 86400000)
  const todayStr = now.toISOString().split("T")[0]
  const futureStr = future.toISOString().split("T")[0]

  const { count } = await supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)
    .gte("policy_expiry_date", todayStr)
    .lte("policy_expiry_date", futureStr)

  return count ?? 0
}

export async function getBirthdaysThisMonth() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const { data } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .not("driver_dob", "is", null)
    .order("driver_dob", { ascending: true })
    .limit(50)

  if (!data) return []

  const monthStr = String(month).padStart(2, "0")
  return data.filter((r) => {
    if (!r.driver_dob) return false
    const dobMonth = String(r.driver_dob).slice(5, 7)
    return dobMonth === monthStr
  })
}

export async function getReminderSettings() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return null

  const { data } = await supabase
    .from("reminder_settings")
    .select("*")
    .eq("company_id", profile.company_id)
    .single()

  return data
}

export async function getOptOuts(search?: string) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  let query = supabase
    .from("opt_outs")
    .select("*")
    .eq("company_id", profile.company_id)
    .order("opted_out_at", { ascending: false })

  if (search) {
    query = query.ilike("mobile_no", `%${search}%`)
  }

  const { data } = await query

  return data ?? []
}

export async function getCompanyTemplates() {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .eq("company_id", profile.company_id)
    .order("template_type", { ascending: true })

  return data ?? []
}

export async function getBirthdaysToday() {
  const all = await getBirthdaysThisMonth()
  const now = new Date()
  const dayStr = String(now.getDate()).padStart(2, "0")
  const monthStr = String(now.getMonth() + 1).padStart(2, "0")

  return all.filter((r) => {
    if (!r.driver_dob) return false
    const parts = String(r.driver_dob).split("-")
    return parts[1] === monthStr && parts[2] === dayStr
  })
}
