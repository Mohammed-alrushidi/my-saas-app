"use server"

import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/supabase/queries"

const PAGE_SIZE = 50

export type CustomerRecord = {
  id: string
  customer_name: string
  mobile_no: string
  policy_no: string
  policy_expiry_date: string
  veh_make_model: string | null
  communication_status: string
  driver_dob: string | null
  created_at: string
}

export type PaginatedResult = {
  data: CustomerRecord[]
  total: number
  page: number
  pageSize: number
}

export async function searchCustomers(
  query: string,
  status: string,
  page: number = 1,
): Promise<PaginatedResult> {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile?.company_id) return { data: [], total: 0, page, pageSize: PAGE_SIZE }

  let countQuery = supabase
    .from("customer_records")
    .select("*", { count: "exact", head: true })
    .eq("company_id", profile.company_id)

  let dataQuery = supabase
    .from("customer_records")
    .select("*")
    .eq("company_id", profile.company_id)

  if (status && status !== "all") {
    countQuery = countQuery.eq("communication_status", status)
    dataQuery = dataQuery.eq("communication_status", status)
  }

  if (query.trim()) {
    const q = `%${query.trim()}%`
    const filter = `customer_name.ilike.${q},policy_no.ilike.${q},mobile_no.ilike.${q}`
    countQuery = countQuery.or(filter)
    dataQuery = dataQuery.or(filter)
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  dataQuery = dataQuery.order("created_at", { ascending: false }).range(from, to)

  const [{ count }, { data }] = await Promise.all([countQuery, dataQuery])

  return { data: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE }
}
