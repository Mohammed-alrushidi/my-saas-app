import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const providerMocks = vi.hoisted(() => ({
  send: vi.fn(),
  getProvider: vi.fn(),
}))

vi.mock("../provider", () => ({ getProvider: providerMocks.getProvider }))

import { sendMessages } from "../send"

describe("sendMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerMocks.getProvider.mockReturnValue({ name: "test", send: providerMocks.send })
    providerMocks.send.mockImplementation(async (_mobile: string, body: string) => ({
      success: true,
      providerMessageId: `SM-${body}`,
      deliveryStatus: "queued",
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("dispatches in bounded batches and preserves result order", async () => {
    vi.useFakeTimers()
    const recipients = Array.from({ length: 6 }, (_, index) => ({
      mobile: `92${String(index).padStart(6, "0")}`,
      body: `message-${index}`,
    }))

    const pending = sendMessages(recipients)
    await Promise.resolve()
    await Promise.resolve()

    expect(providerMocks.send).toHaveBeenCalledTimes(5)

    await vi.runAllTimersAsync()
    const results = await pending

    expect(providerMocks.send).toHaveBeenCalledTimes(6)
    expect(results.map((result) => result.providerMessageId)).toEqual(
      recipients.map((recipient) => `SM-${recipient.body}`),
    )
  })

  it("isolates a thrown recipient failure without failing the batch", async () => {
    providerMocks.send
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce({ success: true, providerMessageId: "SM2", deliveryStatus: "queued" })

    const results = await sendMessages([
      { mobile: "92123456", body: "first" },
      { mobile: "+96892123457", body: "second" },
    ])

    expect(providerMocks.send).toHaveBeenNthCalledWith(1, "+96892123456", "first")
    expect(providerMocks.send).toHaveBeenNthCalledWith(2, "+96892123457", "second")
    expect(results).toEqual([
      { success: false, error: "first failed", mobile: "+96892123456" },
      { success: true, providerMessageId: "SM2", deliveryStatus: "queued", mobile: "+96892123457" },
    ])
  })
})
