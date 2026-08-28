import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getExpectedTwilioSignature } from "twilio"

const ORIGINAL_ENV = process.env
const createAdminClient = vi.fn()
const recordInboundStop = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock("@/lib/messaging/inbound-stop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messaging/inbound-stop")>()
  return {
    ...actual,
    recordInboundStop: (...args: unknown[]) => recordInboundStop(...args),
  }
})

const AUTH_TOKEN = "test-twilio-auth-token"
const PUBLIC_URL = "https://app.example.com/api/messaging/inbound"

function buildRequest(
  params: Record<string, string> = { From: "whatsapp:+96891111111", Body: "STOP" },
  signature?: string,
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "x-twilio-signature": signature ?? getExpectedTwilioSignature(AUTH_TOKEN, PUBLIC_URL, params),
  }
  return new Request(PUBLIC_URL, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  })
}

async function post(request: Request): Promise<Response> {
  const { POST } = await import("../inbound/route")
  return POST(request)
}

describe("POST /api/messaging/inbound", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, TWILIO_AUTH_TOKEN: AUTH_TOKEN }
    vi.clearAllMocks()
    createAdminClient.mockReturnValue({ mocked: "admin-client" })
    recordInboundStop.mockResolvedValue("opted_out")
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("accepts a signed STOP and records the normalized sender", async () => {
    const response = await post(buildRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, outcome: "opted_out" })
    expect(recordInboundStop).toHaveBeenCalledWith(expect.anything(), "+96891111111")
  })

  it("returns an idempotent duplicate outcome", async () => {
    recordInboundStop.mockResolvedValueOnce("already_opted_out")
    const response = await post(buildRequest())
    expect(await response.json()).toEqual({ ok: true, outcome: "already_opted_out" })
  })

  it("fails closed when the auth token is missing", async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const response = await post(buildRequest())
    expect(response.status).toBe(503)
    expect(recordInboundStop).not.toHaveBeenCalled()
  })

  it("rejects a forged signature without touching the database", async () => {
    const response = await post(buildRequest(undefined, "forged"))
    expect(response.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(recordInboundStop).not.toHaveBeenCalled()
  })

  it("ignores signed non-STOP content without touching the database", async () => {
    const params = { From: "whatsapp:+96891111111", Body: "Hello" }
    const response = await post(buildRequest(params))
    expect(await response.json()).toEqual({ ok: true, outcome: "ignored" })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("rejects an invalid signed sender", async () => {
    const params = { From: "not-a-number", Body: "STOP" }
    const response = await post(buildRequest(params))
    expect(response.status).toBe(400)
    expect(recordInboundStop).not.toHaveBeenCalled()
  })
})
