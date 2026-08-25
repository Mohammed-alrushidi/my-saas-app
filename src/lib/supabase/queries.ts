import { createClient } from "@/lib/supabase/server"
import {
  getMuscatBusinessDayBounds,
  muscatExpiryWindow,
  muscatMonthPattern,
} from "@/lib/dates/muscat-day"
import { isBirthdayToday } from "@/lib/dates/birthday"

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

export async function getUpcomingExpiries(days: number, limit = 50, now: Date = new Date()) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  const { start, end } = muscatExpiryWindow(now, days)

  const { data } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .gte("policy_expiry_date", start)
    .lte("policy_expiry_date", end)
    .order("policy_expiry_date", { ascending: true })
    .limit(limit)

  return data ?? []
}

export async function getExpiriesCount(days: number, now: Date = new Date()) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return 0

  const { start, end } = muscatExpiryWindow(now, days)

  const { count } = await supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)
    .gte("policy_expiry_date", start)
    .lte("policy_expiry_date", end)

  return count ?? 0
}

export async function getBirthdaysThisMonth(now: Date = new Date()) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return []

  // SQL-side month match (any birth year) — the previous client-side filter
  // after a limit(50) silently truncated the month list on larger datasets.
  const pattern = muscatMonthPattern(now)

  const { data } = await supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)
    .not("driver_dob", "is", null)
    .like("driver_dob", pattern)
    .order("driver_dob", { ascending: true })
    .limit(50)

  return data ?? []
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

export async function getBirthdaysToday(now: Date = new Date()) {
  const all = await getBirthdaysThisMonth(now)
  const businessDate = getMuscatBusinessDayBounds(now).businessDate
  return all.filter((r) => isBirthdayToday(r.driver_dob, businessDate))
}
