import { describe, expect, it, vi } from "vitest"
import { isStopCommand, normalizeTwilioFrom, recordInboundStop } from "../inbound-stop"

function fakeDb(options: { inserted?: boolean; customers?: { id: string; company_id: string }[] } = {}) {
  const customers = options.customers ?? [
    { id: "customer-a", company_id: "company-a" },
    { id: "customer-b", company_id: "company-b" },
  ]
  const customerSelectEq = vi.fn().mockResolvedValue({ data: customers, error: null })
  const optOutSelect = vi.fn().mockResolvedValue({
    data: options.inserted === false ? [] : [{ id: "opt-out" }],
    error: null,
  })
  const upsert = vi.fn(() => ({ select: optOutSelect }))
  const finalEq = vi.fn().mockResolvedValue({ error: null })
  const secondIn = vi.fn(() => ({ eq: finalEq }))
  const firstIn = vi.fn(() => ({ in: secondIn }))
  const update = vi.fn(() => ({ in: firstIn }))
  const from = vi.fn((table: string) => {
    if (table === "opt_outs") return { upsert }
    if (table === "customer_records") {
      return {
        select: vi.fn(() => ({ eq: customerSelectEq })),
        update,
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { db: { from }, upsert, update, firstIn, secondIn, finalEq }
}

describe("inbound STOP", () => {
  it("normalizes Twilio's WhatsApp sender and accepts STOP case-insensitively", () => {
    expect(normalizeTwilioFrom("whatsapp:+96891111111")).toBe("+96891111111")
    expect(normalizeTwilioFrom("+96891111111")).toBe("+96891111111")
    expect(normalizeTwilioFrom("91111111")).toBeNull()
    expect(isStopCommand(" stop ")).toBe(true)
    expect(isStopCommand("STOP please")).toBe(false)
  })

  it("opts the sender out in every matching tenant and scopes synchronization to exact rows", async () => {
    const fake = fakeDb()
    const outcome = await recordInboundStop(fake.db as never, "+96891111111")

    expect(outcome).toBe("opted_out")
    expect(fake.upsert).toHaveBeenCalledWith([
      { company_id: "company-a", mobile_no: "+96891111111", source: "reply_stop" },
      { company_id: "company-b", mobile_no: "+96891111111", source: "reply_stop" },
    ], { onConflict: "company_id,mobile_no", ignoreDuplicates: true })
    expect(fake.firstIn).toHaveBeenCalledWith("id", ["customer-a", "customer-b"])
    expect(fake.secondIn).toHaveBeenCalledWith("company_id", ["company-a", "company-b"])
    expect(fake.finalEq).toHaveBeenCalledWith("mobile_no", "+96891111111")
  })

  it("returns an idempotent result when unique opt-outs already exist", async () => {
    const fake = fakeDb({ inserted: false })
    expect(await recordInboundStop(fake.db as never, "+96891111111")).toBe("already_opted_out")
  })

  it("does not create an unowned opt-out for an unknown sender", async () => {
    const fake = fakeDb({ customers: [] })
    expect(await recordInboundStop(fake.db as never, "+96891111111")).toBe("unknown_sender")
    expect(fake.upsert).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
  })
})
