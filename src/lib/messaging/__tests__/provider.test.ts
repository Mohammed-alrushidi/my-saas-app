import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const ORIGINAL_ENV = process.env

vi.mock("../twilio", async () => {
  const actual = await vi.importActual("../twilio")
  return {
    ...actual,
    TwilioWhatsAppProvider: class {
      name = "twilio-whatsapp"
      send = vi.fn().mockResolvedValue({ success: true, providerMessageId: "SM..." })
    },
  }
})

describe("messaging provider selection", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("uses mock provider when MOCK_MODE=true regardless of Twilio config", async () => {
    process.env.MOCK_MODE = "true"
    process.env.TWILIO_ACCOUNT_SID = "AC..."
    process.env.TWILIO_AUTH_TOKEN = "token"
    process.env.TWILIO_WHATSAPP_NUMBER = "+1415..."
    process.env.WHATSAPP_LIVE_ENABLED = "true"

    const { getProvider } = await import("../provider")
    const provider = getProvider()

    expect(provider.name).toBe("mock")
    expect(provider.send).toBeDefined()
  })

  it("fails closed when MOCK_MODE=false and WHATSAPP_LIVE_ENABLED is missing", async () => {
    process.env.MOCK_MODE = "false"
    delete process.env.WHATSAPP_LIVE_ENABLED

    const { getProvider } = await import("../provider")

    expect(() => getProvider()).toThrow(
      "Real WhatsApp provider is not enabled. Set WHATSAPP_LIVE_ENABLED=true to activate the live provider.",
    )
  })

  it("fails closed when MOCK_MODE=false and WHATSAPP_LIVE_ENABLED is not exactly true", async () => {
    process.env.MOCK_MODE = "false"
    process.env.WHATSAPP_LIVE_ENABLED = "1"

    const { getProvider } = await import("../provider")

    expect(() => getProvider()).toThrow(
      "Real WhatsApp provider is not enabled. Set WHATSAPP_LIVE_ENABLED=true to activate the live provider.",
    )
  })

  it("fails closed when live gate is enabled but Twilio creds are partial", async () => {
    process.env.MOCK_MODE = "false"
    process.env.WHATSAPP_LIVE_ENABLED = "true"
    process.env.TWILIO_ACCOUNT_SID = "AC..."
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_WHATSAPP_NUMBER

    const { getProvider } = await import("../provider")

    expect(() => getProvider()).toThrow(
      "Missing Twilio configuration. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER in .env.local",
    )
  })

  it("selects Twilio provider path when both gates are open and credentials are complete", async () => {
    process.env.MOCK_MODE = "false"
    process.env.WHATSAPP_LIVE_ENABLED = "true"
    process.env.TWILIO_ACCOUNT_SID = "AC..."
    process.env.TWILIO_AUTH_TOKEN = "token"
    process.env.TWILIO_WHATSAPP_NUMBER = "+1415..."

    const { getProvider } = await import("../provider")
    const provider = getProvider()

    expect(provider.name).toBe("twilio-whatsapp")
    expect(provider.send).toBeDefined()
  })
})
