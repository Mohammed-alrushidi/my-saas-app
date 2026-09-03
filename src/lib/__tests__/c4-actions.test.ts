import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

type DbResponse = { data?: unknown; error?: unknown }
let responses: DbResponse[] = []
const queryLog: { table: string; method: string; args: unknown[] }[] = []

function nextResponse(): DbResponse {
  return responses.shift() ?? { data: null, error: null }
}

function builder(table: string) {
  const chain = {
    select: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "select", args }); return chain }),
    eq: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "eq", args }); return chain }),
    in: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "in", args }); return chain }),
    order: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "order", args }); return chain }),
    limit: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "limit", args }); return chain }),
    insert: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "insert", args }); return chain }),
    update: vi.fn((...args: unknown[]) => { queryLog.push({ table, method: "update", args }); return chain }),
    single: vi.fn(async () => nextResponse()),
    maybeSingle: vi.fn(async () => nextResponse()),
    then: (resolve: (value: DbResponse) => unknown) => Promise.resolve(nextResponse()).then(resolve),
  }
  return chain
}

const db = { from: vi.fn((table: string) => builder(table)) }
const getProfile = vi.fn()
const can = vi.fn()
const getProvider = vi.fn()
const sendMessages = vi.fn()

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }))
vi.mock("@/lib/supabase/queries", () => ({ getProfile: (...args: unknown[]) => getProfile(...args) }))
vi.mock("@/lib/supabase/permissions", () => ({
  can: (...args: unknown[]) => can(...args),
}))
vi.mock("@/lib/messaging/provider", () => ({ getProvider: (...args: unknown[]) => getProvider(...args) }))
vi.mock("@/lib/messaging/send", () => ({ sendMessages: (...args: unknown[]) => sendMessages(...args) }))

const admin = {
  id: "00000000-0000-0000-0000-000000000001",
  company_id: "00000000-0000-0000-0000-000000000002",
  role: "company_admin",
  is_active: true,
  companies: { name: "Tenant A" },
}
const staff = { ...admin, id: "00000000-0000-0000-0000-000000000003", role: "staff" }
const messageId = "00000000-0000-0000-0000-000000000010"
const customerId = "00000000-0000-0000-0000-000000000020"

beforeEach(() => {
  responses = []
  queryLog.length = 0
  vi.clearAllMocks()
  getProfile.mockResolvedValue(admin)
  can.mockResolvedValue(true)
  getProvider.mockReturnValue({ name: "mock" })
  sendMessages.mockResolvedValue([{ success: true, providerMessageId: "mock-retry", deliveryStatus: "sent" }])
})

describe("retryFailedMessage", () => {
  it("claims and finalizes one tenant-scoped retry", async () => {
    responses.push(
      { data: { id: messageId, company_id: admin.company_id, customer_record_id: customerId, message_type: "broadcast", recipient_mobile: "+96891111111", template_used: null, message_body: "Hello", status: "failed", delivery_status: "failed", reminder_stage: null, retry_of_message_id: null, created_at: "2026-08-27T20:00:00.000Z" }, error: null },
      { data: [], error: null },
      { data: { id: customerId, communication_status: "allowed" }, error: null },
      { data: null, error: null },
      { data: { id: "00000000-0000-0000-0000-000000000030" }, error: null },
      { data: [{ id: "00000000-0000-0000-0000-000000000030" }], error: null },
    )

    const { retryFailedMessage } = await import("@/app/dashboard/messages/actions")
    const result = await retryFailedMessage(messageId)

    expect(result).toMatchObject({ success: true, attempt: 1, mock: true })
    expect(sendMessages).toHaveBeenCalledTimes(1)
    expect(queryLog).toContainEqual({ table: "messages", method: "eq", args: ["company_id", admin.company_id] })
    const insert = queryLog.find((entry) => entry.table === "messages" && entry.method === "insert")
    expect(insert?.args[0]).toMatchObject({ company_id: admin.company_id, retry_of_message_id: messageId, retry_attempt: 1, status: "pending" })
  })

  it("enforces backoff and never calls the provider early", async () => {
    const now = new Date().toISOString()
    responses.push(
      { data: { id: messageId, company_id: admin.company_id, customer_record_id: null, message_type: "broadcast", recipient_mobile: "+96891111111", template_used: null, message_body: "Hello", status: "failed", delivery_status: "failed", reminder_stage: null, retry_of_message_id: null, created_at: now }, error: null },
      { data: [], error: null },
    )
    const { retryFailedMessage } = await import("@/app/dashboard/messages/actions")
    const result = await retryFailedMessage(messageId)
    expect(result.error).toBe("Retry backoff is still active")
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(getProvider).not.toHaveBeenCalled()
    expect(sendMessages).not.toHaveBeenCalled()
  })

  it("enforces the three-attempt limit", async () => {
    responses.push(
      { data: { id: messageId, company_id: admin.company_id, customer_record_id: null, message_type: "broadcast", recipient_mobile: "+96891111111", template_used: null, message_body: "Hello", status: "failed", delivery_status: "failed", reminder_stage: null, retry_of_message_id: null, created_at: "2026-08-20T00:00:00.000Z" }, error: null },
      { data: [{ id: "retry-3", status: "failed", delivery_status: "failed", retry_attempt: 3, created_at: "2026-08-20T01:00:00.000Z" }], error: null },
    )
    const { retryFailedMessage } = await import("@/app/dashboard/messages/actions")
    expect((await retryFailedMessage(messageId)).error).toBe("Maximum retry attempts reached")
    expect(sendMessages).not.toHaveBeenCalled()
  })

  it("blocks opted-out recipients before claiming", async () => {
    responses.push(
      { data: { id: messageId, company_id: admin.company_id, customer_record_id: null, message_type: "broadcast", recipient_mobile: "+96891111111", template_used: null, message_body: "Hello", status: "failed", delivery_status: "failed", reminder_stage: null, retry_of_message_id: null, created_at: "2026-08-20T00:00:00.000Z" }, error: null },
      { data: [], error: null },
      { data: { id: "opt-out" }, error: null },
    )
    const { retryFailedMessage } = await import("@/app/dashboard/messages/actions")
    expect((await retryFailedMessage(messageId)).error).toBe("Recipient has opted out")
    expect(sendMessages).not.toHaveBeenCalled()
  })

  it("treats a concurrent unique-claim loss as a duplicate and does not send", async () => {
    responses.push(
      { data: { id: messageId, company_id: admin.company_id, customer_record_id: null, message_type: "broadcast", recipient_mobile: "+96891111111", template_used: null, message_body: "Hello", status: "failed", delivery_status: "failed", reminder_stage: null, retry_of_message_id: null, created_at: "2026-08-20T00:00:00.000Z" }, error: null },
      { data: [], error: null },
      { data: null, error: null },
      { data: null, error: { code: "23505" } },
    )
    const { retryFailedMessage } = await import("@/app/dashboard/messages/actions")
    expect((await retryFailedMessage(messageId)).error).toBe("This retry attempt was already claimed")
    expect(sendMessages).not.toHaveBeenCalled()
  })

  it("fails closed before a claim when provider configuration is invalid", async () => {
    responses.push(
      { data: { id: messageId, company_id: admin.company_id, customer_record_id: null, message_type: "broadcast", recipient_mobile: "+96891111111", template_used: null, message_body: "Hello", status: "failed", delivery_status: "failed", reminder_stage: null, retry_of_message_id: null, created_at: "2026-08-20T00:00:00.000Z" }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    )
    getProvider.mockImplementationOnce(() => { throw new Error("missing") })
    const { retryFailedMessage } = await import("@/app/dashboard/messages/actions")
    expect((await retryFailedMessage(messageId)).error).toBe("Messaging provider is not configured")
    expect(queryLog.some((entry) => entry.method === "insert")).toBe(false)
  })
})

describe("truthful history filters", () => {
  it("rejects impossible message status and type filters", async () => {
    const { getMessageHistory } = await import("@/app/dashboard/messages/actions")
    expect((await getMessageHistory("all", "queued")).error).toBe("Invalid message status filter")
    expect((await getMessageHistory("marketing", "all")).error).toBe("Invalid message type filter")
    expect((await getMessageHistory("all", "all", 1, "received")).error).toBe("Invalid delivery status filter")
    expect(db.from).not.toHaveBeenCalled()
  })
})

describe("broadcast handoff", () => {
  it("fails a direct broadcast closed before database access when provider configuration is invalid", async () => {
    getProvider.mockImplementationOnce(() => { throw new Error("missing") })
    const { confirmBroadcastSelected } = await import("@/app/dashboard/broadcast/actions")
    const submissionId = "00000000-0000-0000-0000-000000000040"
    const result = await confirmBroadcastSelected("Hello", [customerId], submissionId)

    expect(result.error).toBe("Messaging provider is not configured")
    expect(db.from).not.toHaveBeenCalled()
    expect(sendMessages).not.toHaveBeenCalled()
  })

  it("allows permitted staff to submit only same-tenant recipients", async () => {
    getProfile.mockResolvedValueOnce(staff)
    responses.push(
      { data: [{ id: customerId, communication_status: "allowed" }], error: null },
      { data: { id: "00000000-0000-0000-0000-000000000040" }, error: null },
    )
    const { submitBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const result = await submitBroadcastDraft(" Review me ", [customerId])
    expect(result.success).toBe(true)
    const insert = queryLog.find((entry) => entry.table === "broadcast_drafts" && entry.method === "insert")
    expect(insert?.args[0]).toMatchObject({ company_id: admin.company_id, created_by: staff.id, message_body: "Review me", status: "pending_review" })
  })

  it("rejects a cross-tenant or missing recipient snapshot", async () => {
    getProfile.mockResolvedValueOnce(staff)
    responses.push({ data: [], error: null })
    const { submitBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    expect((await submitBroadcastDraft("Review me", [customerId])).error).toContain("do not belong")
    expect(queryLog.some((entry) => entry.table === "broadcast_drafts" && entry.method === "insert")).toBe(false)
  })

  it("uses a conditional pending-review transition so duplicate review loses safely", async () => {
    responses.push({ data: [], error: null })
    const { reviewBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const draftId = "00000000-0000-0000-0000-000000000040"
    expect((await reviewBroadcastDraft(draftId, "approve")).success).toBe(false)
    expect(queryLog).toContainEqual({ table: "broadcast_drafts", method: "eq", args: ["status", "pending_review"] })
  })

  it("allows only one approved-to-sending claim to reach provider dispatch", async () => {
    responses.push({ data: null, error: null })
    const { sendApprovedBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const draftId = "00000000-0000-0000-0000-000000000040"
    expect((await sendApprovedBroadcastDraft(draftId)).success).toBe(false)
    expect(queryLog).toContainEqual({ table: "broadcast_drafts", method: "eq", args: ["company_id", admin.company_id] })
    expect(queryLog).toContainEqual({ table: "broadcast_drafts", method: "eq", args: ["status", "approved"] })
    expect(sendMessages).not.toHaveBeenCalled()
  })

  it("dispatches an approved draft once and records truthful send counts", async () => {
    const draftId = "00000000-0000-0000-0000-000000000040"
    responses.push(
      { data: { id: draftId, message_body: "Hello {{customer_name}}", recipient_ids: [customerId] }, error: null },
      { data: [{ id: customerId, customer_name: "Customer", mobile_no: "+96891111111", communication_status: "allowed" }], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ id: draftId }], error: null },
    )
    const { sendApprovedBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const result = await sendApprovedBroadcastDraft(draftId)
    expect(result.success).toBe(true)
    expect(result.sendResult).toMatchObject({ sent: 1, failed: 0 })
    expect(sendMessages).toHaveBeenCalledTimes(1)
  })

  it("keeps a draft in its claimed state when provider outcome is uncertain", async () => {
    const draftId = "00000000-0000-0000-0000-000000000040"
    responses.push(
      { data: { id: draftId, message_body: "Hello", recipient_ids: [customerId] }, error: null },
      { data: [{ id: customerId, customer_name: "Customer", mobile_no: "+96891111111", communication_status: "allowed" }], error: null },
      { data: null, error: null },
      { data: null, error: { message: "history failed" } },
      { data: null, error: null },
    )
    const { sendApprovedBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const result = await sendApprovedBroadcastDraft(draftId)

    expect(result).toMatchObject({ success: false, sendResult: { uncertain: true } })
    const draftUpdates = queryLog.filter((entry) => entry.table === "broadcast_drafts" && entry.method === "update")
    expect(draftUpdates).toHaveLength(1)
    expect(draftUpdates[0].args[0]).toMatchObject({ status: "sending" })
  })

  it("marks a completed partial provider failure truthfully", async () => {
    const draftId = "00000000-0000-0000-0000-000000000040"
    sendMessages.mockResolvedValueOnce([{ success: false, error: "provider rejected" }])
    responses.push(
      { data: { id: draftId, message_body: "Hello", recipient_ids: [customerId] }, error: null },
      { data: [{ id: customerId, customer_name: "Customer", mobile_no: "+96891111111", communication_status: "allowed" }], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ id: draftId }], error: null },
    )
    const { sendApprovedBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const result = await sendApprovedBroadcastDraft(draftId)

    expect(result.sendResult).toMatchObject({ success: true, sent: 0, failed: 1 })
    const draftUpdates = queryLog.filter((entry) => entry.table === "broadcast_drafts" && entry.method === "update")
    expect(draftUpdates.at(-1)?.args[0]).toMatchObject({ status: "failed", sent_count: 0, failed_count: 1, sent_at: null })
  })

  it("rejects staff review and send before database access", async () => {
    getProfile.mockResolvedValue(staff)
    const { reviewBroadcastDraft, sendApprovedBroadcastDraft } = await import("@/app/dashboard/broadcast/actions")
    const draftId = "00000000-0000-0000-0000-000000000040"
    expect((await reviewBroadcastDraft(draftId, "approve")).error).toContain("Only admins")
    expect((await sendApprovedBroadcastDraft(draftId)).error).toContain("Only admins")
    expect(db.from).not.toHaveBeenCalled()
  })
})
