import { beforeEach, describe, expect, it, vi } from "vitest"

const twilioMocks = vi.hoisted(() => {
  const create = vi.fn()
  return {
    create,
    clientFactory: vi.fn(() => ({ messages: { create } })),
  }
})

vi.mock("twilio", () => ({ default: twilioMocks.clientFactory }))

import { TwilioWhatsAppProvider } from "../twilio"

describe("TwilioWhatsAppProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls Twilio with WhatsApp addresses and the C2 status callback", async () => {
    twilioMocks.create.mockResolvedValueOnce({ sid: "SM123", status: "queued" })
    const provider = new TwilioWhatsAppProvider(
      `AC${"0".repeat(32)}`,
      "a".repeat(32),
      "+14155238886",
      "https://app.example.com/api/messaging/status",
    )

    const result = await provider.send("+96892123456", "Hello")

    expect(twilioMocks.create).toHaveBeenCalledWith({
      from: "whatsapp:+14155238886",
      to: "whatsapp:+96892123456",
      body: "Hello",
      statusCallback: "https://app.example.com/api/messaging/status",
    })
    expect(result).toEqual({ success: true, providerMessageId: "SM123", deliveryStatus: "queued" })
  })

  it("reuses the C2 mapping for an immediate terminal provider failure", async () => {
    twilioMocks.create.mockResolvedValueOnce({ sid: "SM456", status: "undelivered" })
    const provider = new TwilioWhatsAppProvider("account", "token", "whatsapp:+14155238886")

    await expect(provider.send("whatsapp:+96892123456", "Hello")).resolves.toEqual({
      success: false,
      error: "Twilio rejected: undelivered",
      providerMessageId: "SM456",
      deliveryStatus: "undelivered",
    })
  })

  it("returns a failed result when the provider call throws", async () => {
    twilioMocks.create.mockRejectedValueOnce(new Error("network unavailable"))
    const provider = new TwilioWhatsAppProvider("account", "token", "+14155238886")

    await expect(provider.send("+96892123456", "Hello")).resolves.toEqual({
      success: false,
      error: "network unavailable",
    })
  })
})
