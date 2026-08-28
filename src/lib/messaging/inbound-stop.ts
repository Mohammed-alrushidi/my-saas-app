import type { SupabaseClient } from "@supabase/supabase-js"

export type InboundStopOutcome = "opted_out" | "already_opted_out" | "unknown_sender"

type QueryError = { message: string } | null

export type InboundStopDb = Pick<SupabaseClient, "from">

export function normalizeTwilioFrom(value: string): string | null {
  const raw = value.toLowerCase().startsWith("whatsapp:") ? value.slice(9) : value
  const normalized = raw.trim()
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null
}

export function isStopCommand(value: string): boolean {
  return value.trim().toUpperCase() === "STOP"
}

export async function recordInboundStop(
  db: InboundStopDb,
  mobile: string,
): Promise<InboundStopOutcome> {
  const { data: customers, error: customerError } = await db
    .from("customer_records")
    .select("id, company_id")
    .eq("mobile_no", mobile)

  if (customerError) throw new Error((customerError as QueryError)?.message ?? "Failed to resolve sender")
  if (!customers || customers.length === 0) return "unknown_sender"

  const companyIds = [...new Set(customers.map((row: { company_id: string }) => row.company_id))]
  const optOutRows = companyIds.map((companyId) => ({
    company_id: companyId,
    mobile_no: mobile,
    source: "reply_stop",
  }))

  const { data: inserted, error: optOutError } = await db
    .from("opt_outs")
    .upsert(optOutRows, { onConflict: "company_id,mobile_no", ignoreDuplicates: true })
    .select("id")

  if (optOutError) throw new Error((optOutError as QueryError)?.message ?? "Failed to record opt-out")

  const customerIds = customers.map((row: { id: string }) => row.id)
  const { error: syncError } = await db
    .from("customer_records")
    .update({ communication_status: "opted_out" })
    .in("id", customerIds)
    .in("company_id", companyIds)
    .eq("mobile_no", mobile)

  if (syncError) throw new Error((syncError as QueryError)?.message ?? "Failed to synchronize opt-out")

  return inserted && inserted.length > 0 ? "opted_out" : "already_opted_out"
}
