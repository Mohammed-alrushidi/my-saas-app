import type { DeliveryStatus } from "./status"

export type SendResult = {
  success: boolean
  providerMessageId?: string
  deliveryStatus?: DeliveryStatus
  error?: string
}

export type ProviderTemplate = {
  contentSid: string
  variables?: Record<string, string>
}

export interface MessageProvider {
  name: string
  send(to: string, body: string, template?: ProviderTemplate): Promise<SendResult>
}
