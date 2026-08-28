import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  isStopCommand,
  normalizeTwilioFrom,
  recordInboundStop,
  type InboundStopDb,
} from "@/lib/messaging/inbound-stop"
import { validateTwilioWebhook, webhookFormString } from "@/lib/messaging/twilio-webhook"

export async function POST(request: Request) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!authToken) {
      console.error("Inbound webhook misconfigured: TWILIO_AUTH_TOKEN is not set — rejecting request")
      return NextResponse.json({ error: "Webhook authentication is not configured" }, { status: 503 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: "Invalid form payload" }, { status: 400 })
    }

    const from = webhookFormString(formData, "From")
    const body = webhookFormString(formData, "Body")
    if (!from || !body) {
      return NextResponse.json({ error: "Missing From or Body" }, { status: 400 })
    }

    if (!validateTwilioWebhook(request, formData, authToken)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    const mobile = normalizeTwilioFrom(from)
    if (!mobile) {
      return NextResponse.json({ error: "Invalid sender" }, { status: 400 })
    }

    if (!isStopCommand(body)) {
      return NextResponse.json({ ok: true, outcome: "ignored" })
    }

    const outcome = await recordInboundStop(
      createAdminClient() as unknown as InboundStopDb,
      mobile,
    )

    return NextResponse.json({ ok: true, outcome })
  } catch (error: unknown) {
    console.error("Inbound webhook error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
