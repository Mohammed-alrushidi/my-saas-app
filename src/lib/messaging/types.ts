export type SendResult = {
  success: boolean
  providerMessageId?: string
  error?: string
}

export interface MessageProvider {
  name: string
  send(to: string, body: string): Promise<SendResult>
}
