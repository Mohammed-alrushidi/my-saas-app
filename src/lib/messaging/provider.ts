import { TwilioWhatsAppProvider } from "./twilio"
import type { MessageProvider, SendResult } from "./types"
import { isIP } from "node:net"

let provider: MessageProvider | null = null

class MockWhatsAppProvider implements MessageProvider {
  name = "mock"

  async send(): Promise<SendResult> {
    const id = `mock-sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    return { success: true, providerMessageId: id, deliveryStatus: "sent" }
  }
}

function isNonPublicHostname(hostnameValue: string): boolean {
  const hostname = hostnameValue.toLowerCase().replace(/^\[|\]$/g, "")
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return true

  const ipVersion = isIP(hostname)
  if (ipVersion === 4) {
    const [a, b, c] = hostname.split(".").map(Number)
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
      || a >= 224
  }

  if (ipVersion === 6) {
    return hostname === "::"
      || hostname === "::1"
      || hostname.startsWith("fc")
      || hostname.startsWith("fd")
      || /^fe[89ab]/.test(hostname)
      || hostname.startsWith("::ffff:")
  }

  return false
}

function getLiveStatusCallbackUrl(siteUrlValue: string | undefined): string {
  if (!siteUrlValue) {
    throw new Error("Missing live provider callback configuration. Set SITE_URL to the public HTTPS application URL.")
  }

  let siteUrl: URL
  try {
    siteUrl = new URL(siteUrlValue)
  } catch {
    throw new Error("Invalid live provider callback configuration. SITE_URL must be a public HTTPS URL.")
  }

  if (siteUrl.protocol !== "https:" || isNonPublicHostname(siteUrl.hostname) || siteUrl.username || siteUrl.password) {
    throw new Error("Invalid live provider callback configuration. SITE_URL must be a public HTTPS URL.")
  }

  return new URL("/api/messaging/status", siteUrl.origin).toString()
}

export function getProvider(): MessageProvider {
  if (!provider) {
    const isMock = process.env.MOCK_MODE === "true"

    if (isMock) {
      console.info(
        "MOCK_MODE enabled — using mock provider. No real WhatsApp messages will be sent.",
      )
      provider = new MockWhatsAppProvider()
      return provider
    }

    const liveEnabled = process.env.WHATSAPP_LIVE_ENABLED === "true"

    if (!liveEnabled) {
      throw new Error(
        "Real WhatsApp provider is not enabled. Set WHATSAPP_LIVE_ENABLED=true to activate the live provider.",
      )
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_WHATSAPP_NUMBER
    const siteUrl = process.env.SITE_URL

    if (!accountSid || !authToken || !from) {
      throw new Error(
        "Missing Twilio configuration. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER are required.",
      )
    }

    const normalizedFrom = from.startsWith("whatsapp:") ? from.slice("whatsapp:".length) : from
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !/^[0-9a-f]{32}$/i.test(authToken) || !/^\+[1-9]\d{7,14}$/.test(normalizedFrom)) {
      throw new Error("Invalid Twilio configuration. Check the account SID, auth token, and WhatsApp sender number.")
    }

    const statusCallbackUrl = getLiveStatusCallbackUrl(siteUrl)

    provider = new TwilioWhatsAppProvider(
      accountSid,
      authToken,
      from,
      statusCallbackUrl,
    )
  }
  return provider
}
