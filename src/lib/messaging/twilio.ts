import twilio from "twilio"
import type { MessageListInstanceCreateOptions } from "twilio/lib/rest/api/v2010/account/message"
import type { MessageProvider, SendResult } from "./types"

const FAILURE_STATUSES = new Set(["failed", "undelivered", "canceled"])

type TwilioClient = ReturnType<typeof twilio>

export class TwilioWhatsAppProvider implements MessageProvider {
  name = "twilio-whatsapp"
  private client: TwilioClient
  private from: string
  private statusCallbackUrl?: string

  constructor(accountSid: string, authToken: string, from: string, statusCallbackUrl?: string) {
    this.client = twilio(accountSid, authToken)
    this.from = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`
    this.statusCallbackUrl = statusCallbackUrl
  }

  async send(to: string, body: string): Promise<SendResult> {
    try {
      const number = to.startsWith("whatsapp:") ? to.slice("whatsapp:".length) : to
      const formattedTo = `whatsapp:+${number.replace(/^\+/, "")}`

      const opts: MessageListInstanceCreateOptions = {
        from: this.from as any,
        to: formattedTo as any,
        body,
      }

      if (this.statusCallbackUrl) {
        opts.statusCallback = this.statusCallbackUrl
      }

      const message = await this.client.messages.create(opts)

      if (FAILURE_STATUSES.has(message.status ?? "")) {
        return { success: false, error: `Twilio rejected: ${message.status}`, providerMessageId: message.sid }
      }

      return { success: true, providerMessageId: message.sid }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return { success: false, error: message }
    }
  }
}
