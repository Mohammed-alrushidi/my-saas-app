import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { applyDeliveryStatusUpdate, type StatusUpdateDb } from "@/lib/messaging/status"
import { validateTwilioWebhook, webhookFormString } from "@/lib/messaging/twilio-webhook"

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

    const messageSid = webhookFormString(formData, "MessageSid")
    const messageStatus = webhookFormString(formData, "MessageStatus")

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: "Missing MessageSid or MessageStatus" }, { status: 400 })
    }

    if (!validateTwilioWebhook(request, formData, authToken)) {
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
