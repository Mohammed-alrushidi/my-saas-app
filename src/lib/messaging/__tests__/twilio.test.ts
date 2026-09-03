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

  it("uses Twilio Content API fields for an approved template instead of a free-form body", async () => {
    twilioMocks.create.mockResolvedValueOnce({ sid: "SM789", status: "queued" })
    const provider = new TwilioWhatsAppProvider(
      `AC${"0".repeat(32)}`,
      "a".repeat(32),
      "+14155238886",
      "https://app.example.com/api/messaging/status",
    )
    const contentSid = `HX${"a".repeat(32)}`

    const result = await provider.send("+96892123456", "Rendered preview", {
      contentSid,
      variables: { "1": "Fatima", "2": "Birthday Co" },
    })

    expect(twilioMocks.create).toHaveBeenCalledWith({
      from: "whatsapp:+14155238886",
      to: "whatsapp:+96892123456",
      contentSid,
      contentVariables: JSON.stringify({ "1": "Fatima", "2": "Birthday Co" }),
      statusCallback: "https://app.example.com/api/messaging/status",
    })
    expect(twilioMocks.create.mock.calls[0][0]).not.toHaveProperty("body")
    expect(result).toEqual({ success: true, providerMessageId: "SM789", deliveryStatus: "queued" })
  })

  it("fails closed before contacting Twilio when the Content SID is invalid", async () => {
    const provider = new TwilioWhatsAppProvider("account", "token", "+14155238886")

    await expect(provider.send("+96892123456", "Rendered preview", {
      contentSid: "not-approved",
      variables: { "1": "Fatima" },
    })).resolves.toEqual({
      success: false,
      error: "Invalid Twilio Content SID",
    })

    expect(twilioMocks.create).not.toHaveBeenCalled()
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
