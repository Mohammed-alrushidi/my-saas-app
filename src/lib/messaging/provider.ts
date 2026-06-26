import { TwilioWhatsAppProvider } from "./twilio"
import type { MessageProvider, SendResult } from "./types"

let provider: MessageProvider | null = null

/**
 * Mock provider used when Twilio credentials are not configured.
 * Returns success for every valid send request without making any
 * network call. The providerMessageId starts with "mock-" so callers
 * can detect mock mode and handle it accordingly.
 *
 * Mock success means simulated delivery — no WhatsApp message is sent.
 */
class MockWhatsAppProvider implements MessageProvider {
  name = "mock"

  async send(_to: string, _body: string): Promise<SendResult> {
    const id = `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    return { success: true, providerMessageId: id }
  }
}

export function getProvider(): MessageProvider {
  if (!provider) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_WHATSAPP_NUMBER
    const siteUrl = process.env.SITE_URL

    if (accountSid && authToken && from) {
      const isLocalhost = siteUrl?.includes("localhost") || siteUrl?.includes("127.0.0.1") || siteUrl?.includes("0.0.0.0")
      const statusCallbackUrl = siteUrl && !isLocalhost
        ? `${siteUrl.replace(/\/+$/, "")}/api/messaging/status`
        : undefined

      if (!statusCallbackUrl) {
        console.warn("SITE_URL not set or is localhost — delivery status callbacks will not be sent by Twilio")
      }

      provider = new TwilioWhatsAppProvider(accountSid, authToken, from, statusCallbackUrl)
    } else {
      console.info("Twilio credentials not configured — using mock provider. No real WhatsApp messages will be sent.")
      provider = new MockWhatsAppProvider()
    }
  }
  return provider
}
