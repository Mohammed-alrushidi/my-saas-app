import { redirect } from "next/navigation"
import { getProfile } from "@/lib/supabase/queries"
import { createAdminClient } from "@/lib/supabase/admin"

export type PlatformDashboardData = {
  totalCompanies: number
  activeCompanies: number
  inactiveCompanies: number
  totalCustomerRecords: number
  totalMessages: number
  messagesSentToday: number
  messagesSentThisMonth: number
  failedMessages: number
  recentCompanies: Array<{
    id: string
    name: string
    domain: string
    is_active: boolean
    subscription_status: string
    created_at: string
  }>
  recentImports: Array<{
    id: string
    companyName: string
    totalRows: number
    validRows: number
    invalidRows: number
    status: string
    created_at: string
  }>
}

export async function getPlatformDashboardData(): Promise<PlatformDashboardData> {
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (profile.role !== "super_admin") redirect("/dashboard")

  const supabase = createAdminClient()

  const today = new Date()
  const todayStart = today.toISOString().slice(0, 10) + "T00:00:00.000Z"
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

  const [
    { count: totalCompanies },
    { count: activeCompanies },
    { count: inactiveCompanies },
    { count: totalCustomerRecords },
    { count: totalMessages },
    { count: messagesSentToday },
    { count: messagesSentThisMonth },
    { count: failedMessages },
    { data: recentCompanies },
    { data: recentImportsData },
  ] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("is_active", false),
    supabase.from("customer_records").select("*", { count: "exact", head: true }),
    supabase.from("messages").select("*", { count: "exact", head: true }),
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", todayStart),
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", monthStart),
    supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("companies").select("id, name, domain, is_active, subscription_status, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("imports").select("id, total_rows, valid_rows, invalid_rows, status, created_at, companies(name)").order("created_at", { ascending: false }).limit(5),
  ])

  const recentImports = (recentImportsData ?? []).map((i: any) => ({
    id: i.id,
    companyName: i.companies?.name ?? "Unknown",
    totalRows: i.total_rows,
    validRows: i.valid_rows,
    invalidRows: i.invalid_rows,
    status: i.status,
    created_at: i.created_at,
  }))

  return {
    totalCompanies: totalCompanies ?? 0,
    activeCompanies: activeCompanies ?? 0,
    inactiveCompanies: inactiveCompanies ?? 0,
    totalCustomerRecords: totalCustomerRecords ?? 0,
    totalMessages: totalMessages ?? 0,
    messagesSentToday: messagesSentToday ?? 0,
    messagesSentThisMonth: messagesSentThisMonth ?? 0,
    failedMessages: failedMessages ?? 0,
    recentCompanies: (recentCompanies ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      is_active: c.is_active,
      subscription_status: c.subscription_status,
      created_at: c.created_at,
    })),
    recentImports,
  }
}
