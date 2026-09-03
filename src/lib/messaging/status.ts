export const DELIVERY_STATUSES = ["queued", "sent", "delivered", "read", "undelivered", "failed", "canceled"] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export type StatusUpdateOutcome = "updated" | "unchanged" | "ignored" | "unknown_message"

const TWILIO_STATUS_MAP: Record<string, DeliveryStatus> = {
  accepted: "queued",
  scheduled: "queued",
  queued: "queued",
  sending: "queued",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  undelivered: "undelivered",
  failed: "failed",
  canceled: "canceled",
}

export function mapTwilioStatus(raw: string): DeliveryStatus | null {
  return TWILIO_STATUS_MAP[raw.toLowerCase()] ?? null
}

const ALLOWED_PREVIOUS: Record<DeliveryStatus, readonly ("null" | DeliveryStatus)[]> = {
  queued: ["null"],
  sent: ["null", "queued"],
  delivered: ["null", "queued", "sent"],
  read: ["null", "queued", "sent", "delivered"],
  undelivered: ["null", "queued", "sent"],
  failed: ["null", "queued", "sent"],
  canceled: ["null", "queued"],
}

function predecessorFilter(next: DeliveryStatus): string {
  const parts: string[] = []
  const statuses: DeliveryStatus[] = []
  for (const prev of ALLOWED_PREVIOUS[next]) {
    if (prev === "null") {
      parts.push("delivery_status.is.null")
    } else {
      statuses.push(prev)
    }
  }
  if (statuses.length > 0) {
    parts.push(`delivery_status.in.(${statuses.join(",")})`)
  }
  return parts.join(",")
}

interface UpdateQuery {
  or(expression: string): {
    select(columns: string): PromiseLike<{ data: { id: unknown }[] | null; error: { message: string } | null }>
  }
}

export interface StatusUpdateDb {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): UpdateQuery
    }
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { id: unknown } | null; error: { message: string } | null }>
      }
    }
  }
}

export async function applyDeliveryStatusUpdate(
  db: StatusUpdateDb,
  messageSid: string,
  rawStatus: string,
): Promise<StatusUpdateOutcome> {
  const next = mapTwilioStatus(rawStatus)
  if (!next) return "ignored"

  const { data, error } = await db
    .from("messages")
    .update({ delivery_status: next })
    .eq("provider_message_id", messageSid)
    .or(predecessorFilter(next))
    .select("id")

  if (error) throw new Error(error.message)

  if (data && data.length > 0) return "updated"

  const { data: existing, error: selectError } = await db
    .from("messages")
    .select("id")
    .eq("provider_message_id", messageSid)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)

  return existing ? "unchanged" : "unknown_message"
}
