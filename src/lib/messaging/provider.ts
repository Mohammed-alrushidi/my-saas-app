import { TwilioWhatsAppProvider } from "./twilio"
import type { MessageProvider } from "./types"

let provider: MessageProvider | null = null

export function getProvider(): MessageProvider {
  if (!provider) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_WHATSAPP_NUMBER
    const siteUrl = process.env.SITE_URL

    if (!accountSid || !authToken || !from) {
      throw new Error(
        "Missing Twilio configuration. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER in .env.local",
      )
    }

    const isLocalhost = siteUrl?.includes("localhost") || siteUrl?.includes("127.0.0.1") || siteUrl?.includes("0.0.0.0")
    const statusCallbackUrl = siteUrl && !isLocalhost
      ? `${siteUrl.replace(/\/+$/, "")}/api/messaging/status`
      : undefined

    if (!statusCallbackUrl) {
      console.warn("SITE_URL not set or is localhost — delivery status callbacks will not be sent by Twilio")
    }

    provider = new TwilioWhatsAppProvider(accountSid, authToken, from, statusCallbackUrl)
  }
  return provider
}
