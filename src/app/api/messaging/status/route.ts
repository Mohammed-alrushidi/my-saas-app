import { NextResponse } from "next/server"
import twilio from "twilio"
import { createAdminClient } from "@/lib/supabase/admin"
import { applyDeliveryStatusUpdate, type StatusUpdateDb } from "@/lib/messaging/status"

const MAX_FIELD_LENGTH = 255

function canonicalCallbackUrl(request: Request): string {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get("x-forwarded-proto")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const host = forwardedHost ?? request.headers.get("host") ?? url.host
  const proto = (forwardedProto ?? url.protocol.replace(/:$/, "")).replace(/:$/, "")
  return `${proto}://${host}${url.pathname}${url.search}`
}

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_FIELD_LENGTH) return null
  return trimmed
}

export async function POST(request: Request) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error("Status webhook misconfigured: TWILIO_AUTH_TOKEN is not set — rejecting request")
      return NextResponse.json({ error: "Webhook authentication is not configured" }, { status: 503 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: "Invalid form payload" }, { status: 400 })
    }

    const messageSid = formString(formData, "MessageSid")
    const messageStatus = formString(formData, "MessageStatus")

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: "Missing MessageSid or MessageStatus" }, { status: 400 })
    }

    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      if (typeof value === "string") params[key] = value
    })

    const signature = request.headers.get("x-twilio-signature") ?? ""
    const isValid = twilio.validateRequest(authToken, signature, canonicalCallbackUrl(request), params)
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    const supabase = createAdminClient()
    const outcome = await applyDeliveryStatusUpdate(supabase as unknown as StatusUpdateDb, messageSid, messageStatus)

    return NextResponse.json({ ok: outcome !== "unknown_message", outcome })
  } catch (err: unknown) {
    console.error("Status webhook error:", err instanceof Error ? err.message : "Unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
