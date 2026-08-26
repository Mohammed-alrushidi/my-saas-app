import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getExpectedTwilioSignature } from "twilio"

const ORIGINAL_ENV = process.env

const createAdminClient = vi.fn()
const applyDeliveryStatusUpdate = vi.fn()

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

vi.mock("@/lib/messaging/status", () => ({
  applyDeliveryStatusUpdate: (...args: unknown[]) => applyDeliveryStatusUpdate(...args),
}))

const AUTH_TOKEN = "test-twilio-auth-token"
const HOST = "app.example.com"
const PATH = "/api/messaging/status"
const PUBLIC_URL = `https://${HOST}${PATH}`

function buildRequest(options: {
  params?: Record<string, string>
  signatureUrl?: string
  requestUrl?: string
  signature?: string
  headers?: Record<string, string>
} = {}): Request {
  const {
    params = { MessageSid: "SM00000000000000000000000000000000", MessageStatus: "delivered" },
    signatureUrl = PUBLIC_URL,
    requestUrl = PUBLIC_URL,
    headers = {},
  } = options

  const body = new URLSearchParams(params).toString()
  const headerBag: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    ...headers,
  }
  if (!("x-twilio-signature" in headerBag)) {
    headerBag["x-twilio-signature"] =
      options.signature ?? getExpectedTwilioSignature(AUTH_TOKEN, signatureUrl, params)
  }
  return new Request(requestUrl, { method: "POST", headers: headerBag, body })
}

async function post(request: Request): Promise<Response> {
  const { POST } = await import("../status/route")
  return POST(request)
}

describe("POST /api/messaging/status", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN
    vi.clearAllMocks()
    createAdminClient.mockReturnValue({ mocked: "admin-client" })
    applyDeliveryStatusUpdate.mockResolvedValue("updated")
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it("accepts a validly signed callback and applies the status update", async () => {
    const res = await post(
      buildRequest({
        params: { MessageSid: "SM111", MessageStatus: "delivered" },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: "updated" })
    expect(applyDeliveryStatusUpdate).toHaveBeenCalledWith(expect.anything(), "SM111", "delivered")
  })

  it("returns 400 when MessageSid is missing", async () => {
    const res = await post(buildRequest({ params: { MessageStatus: "delivered" } }))

    expect(res.status).toBe(400)
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })

  it("returns 400 when MessageStatus is missing", async () => {
    const res = await post(buildRequest({ params: { MessageSid: "SM111" } }))

    expect(res.status).toBe(400)
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })

  it("fails closed with 503 when TWILIO_AUTH_TOKEN is not configured", async () => {
    delete process.env.TWILIO_AUTH_TOKEN

    const res = await post(buildRequest())

    expect(res.status).toBe(503)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })

  it("rejects a forged or tampered payload with 403 and never touches the database", async () => {
    const res = await post(
      buildRequest({
        params: {
          MessageSid: "SM-victim-other-company",
          MessageStatus: "failed",
        },
        signature: getExpectedTwilioSignature(AUTH_TOKEN, PUBLIC_URL, {
          MessageSid: "SM-victim-other-company",
          MessageStatus: "delivered",
        }),
      }),
    )

    expect(res.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })

  it("rejects requests with a missing signature header with 403", async () => {
    const res = await post(buildRequest({ signature: "" }))

    expect(res.status).toBe(403)
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })

  it("rejects signatures produced with a different auth token with 403", async () => {
    const forged = buildRequest({
      signature: getExpectedTwilioSignature("attacker-token", PUBLIC_URL, {
        MessageSid: "SM111",
        MessageStatus: "delivered",
      }),
    })

    const res = await post(forged)

    expect(res.status).toBe(403)
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })

  it("validates against the forwarded proto/host so proxy-rewritten URLs still pass", async () => {
    const res = await post(
      buildRequest({
        requestUrl: "http://10.1.2.3:3000/api/messaging/status",
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": HOST,
        },
      }),
    )

    expect(res.status).toBe(200)
    expect(applyDeliveryStatusUpdate).toHaveBeenCalledOnce()
  })

  it("returns 200 unchanged for duplicate callbacks (idempotent replay)", async () => {
    applyDeliveryStatusUpdate.mockResolvedValue("unchanged")

    const first = await post(buildRequest())
    const replay = await post(buildRequest())

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({ ok: true, outcome: "unchanged" })
  })

  it("answers 200 without writing when the status is outside the delivery lifecycle", async () => {
    applyDeliveryStatusUpdate.mockResolvedValue("ignored")

    const res = await post(buildRequest({ params: { MessageSid: "SM111", MessageStatus: "received" } }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: "ignored" })
  })

  it("answers 200 ok:false when the signed SID is unknown to us", async () => {
    applyDeliveryStatusUpdate.mockResolvedValue("unknown_message")

    const res = await post(buildRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, outcome: "unknown_message" })
  })

  it("returns a generic 500 on database failure without leaking internals", async () => {
    applyDeliveryStatusUpdate.mockRejectedValue(new Error("supabase secret detail: role key xyz"))

    const res = await post(buildRequest())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("Internal server error")
    expect(JSON.stringify(body)).not.toContain("supabase secret detail")
  })

  it("returns 400 on a non-form payload instead of throwing", async () => {
    const request = new Request(PUBLIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-twilio-signature": "garbage" },
      body: JSON.stringify({ MessageSid: "SM111", MessageStatus: "delivered" }),
    })

    const res = await post(request)

    expect([400, 403]).toContain(res.status)
    expect(applyDeliveryStatusUpdate).not.toHaveBeenCalled()
  })
})
