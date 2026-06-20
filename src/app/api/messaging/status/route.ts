import { NextResponse } from "next/server"
import twilio from "twilio"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const messageSid = formData.get("MessageSid") as string | null
    const messageStatus = formData.get("MessageStatus") as string | null

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: "Missing MessageSid or MessageStatus" }, { status: 400 })
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (authToken) {
      const url = request.url
      const params: Record<string, string> = {}
      formData.forEach((value, key) => { params[key] = value.toString() })
      const twilioSignature = request.headers.get("x-twilio-signature") ?? ""

      const isValid = twilio.validateRequest(authToken, twilioSignature, url, params)
      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
      }
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from("messages")
      .update({ delivery_status: messageStatus })
      .eq("provider_message_id", messageSid)

    if (error) {
      console.error("Failed to update delivery status:", error.message)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("Status webhook error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
