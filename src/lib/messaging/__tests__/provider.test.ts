import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const ORIGINAL_ENV = process.env
const twilioMocks = vi.hoisted(() => ({ constructor: vi.fn() }))

vi.mock("../twilio", () => ({
    TwilioWhatsAppProvider: class {
      name = "twilio-whatsapp"
      send = vi.fn().mockResolvedValue({ success: true, providerMessageId: "SM..." })

      constructor(...args: unknown[]) {
        twilioMocks.constructor(...args)
      }
    },
}))

describe("messaging provider selection", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("uses mock provider when MOCK_MODE=true regardless of Twilio config", async () => {
    process.env.MOCK_MODE = "true"
    process.env.TWILIO_ACCOUNT_SID = "invalid-but-ignored"
    process.env.TWILIO_AUTH_TOKEN = "invalid-but-ignored"
    process.env.TWILIO_WHATSAPP_NUMBER = "invalid-but-ignored"
    process.env.WHATSAPP_LIVE_ENABLED = "true"

    const { getProvider } = await import("../provider")
    const provider = getProvider()

    expect(provider.name).toBe("mock")
    expect(provider.send).toBeDefined()
    expect(twilioMocks.constructor).not.toHaveBeenCalled()
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
      "Missing Twilio configuration. TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER are required.",
    )
  })

  it("fails closed when live Twilio identifiers are malformed", async () => {
    process.env.MOCK_MODE = "false"
    process.env.WHATSAPP_LIVE_ENABLED = "true"
    process.env.TWILIO_ACCOUNT_SID = "AC..."
    process.env.TWILIO_AUTH_TOKEN = "token"
    process.env.TWILIO_WHATSAPP_NUMBER = "+1415..."
    process.env.SITE_URL = "https://example.com"

    const { getProvider } = await import("../provider")

    expect(() => getProvider()).toThrow("Invalid Twilio configuration")
    expect(twilioMocks.constructor).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    "http://example.com",
    "https://localhost:3000",
    "https://10.0.0.1",
    "https://[::1]",
    "not-a-url",
  ])("fails closed when the live callback URL is not public HTTPS: %s", async (siteUrl) => {
    process.env.MOCK_MODE = "false"
    process.env.WHATSAPP_LIVE_ENABLED = "true"
    process.env.TWILIO_ACCOUNT_SID = `AC${"0".repeat(32)}`
    process.env.TWILIO_AUTH_TOKEN = "a".repeat(32)
    process.env.TWILIO_WHATSAPP_NUMBER = "+14155238886"
    if (siteUrl === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = siteUrl

    const { getProvider } = await import("../provider")

    expect(() => getProvider()).toThrow(/callback configuration/)
    expect(twilioMocks.constructor).not.toHaveBeenCalled()
  })

  it("selects Twilio provider path when both gates are open and credentials are complete", async () => {
    process.env.MOCK_MODE = "false"
    process.env.WHATSAPP_LIVE_ENABLED = "true"
    process.env.TWILIO_ACCOUNT_SID = `AC${"0".repeat(32)}`
    process.env.TWILIO_AUTH_TOKEN = "a".repeat(32)
    process.env.TWILIO_WHATSAPP_NUMBER = "+14155238886"
    process.env.SITE_URL = "https://app.example.com/ignored-path"

    const { getProvider } = await import("../provider")
    const provider = getProvider()

    expect(provider.name).toBe("twilio-whatsapp")
    expect(provider.send).toBeDefined()
    expect(twilioMocks.constructor).toHaveBeenCalledWith(
      `AC${"0".repeat(32)}`,
      "a".repeat(32),
      "+14155238886",
      "https://app.example.com/api/messaging/status",
    )
  })
})
