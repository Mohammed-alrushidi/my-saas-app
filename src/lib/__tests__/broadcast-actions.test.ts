import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockResolveValue: any = { data: null, error: null }

const mockChain: any = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  in: vi.fn(() => Promise.resolve(mockResolveValue)),
  order: vi.fn(() => mockChain),
  range: vi.fn(() => Promise.resolve(mockResolveValue)),
  limit: vi.fn(() => Promise.resolve(mockResolveValue)),
  gte: vi.fn(() => mockChain),
  lte: vi.fn(() => mockChain),
  not: vi.fn(() => mockChain),
  or: vi.fn(() => mockChain),
  insert: vi.fn(() => Promise.resolve({ error: null })),
  maybeSingle: vi.fn(() => Promise.resolve(mockResolveValue)),
  single: vi.fn(() => Promise.resolve(mockResolveValue)),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

const mockGetProfile = vi.fn(() => ({
  id: "test-user-id",
  company_id: "test-company-id",
  role: "company_admin",
  companies: { name: "Test Company" },
}))

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
}))

const mockSendMessages = vi.fn((recipients: any[]) =>
  recipients.map(() => ({ success: true, providerMessageId: "mock-sid" })),
)

vi.mock("@/lib/messaging/send", () => ({
  sendMessages: (...args: any[]) => mockSendMessages(...args),
}))

import { loadBroadcastTemplate, getBroadcastRecipientsPaginated, confirmBroadcastSelected } from "@/app/dashboard/broadcast/actions"

describe("loadBroadcastTemplate", () => {
  beforeEach(() => {
    mockResolveValue = { data: null, error: null }
  })

  it("returns template body when template exists", async () => {
    mockResolveValue = { data: { body: "Hello {{customer_name}}" }, error: null }

    const result = await loadBroadcastTemplate()
    expect(result.body).toBe("Hello {{customer_name}}")
  })

  it("returns null when no template exists", async () => {
    const result = await loadBroadcastTemplate()
    expect(result.body).toBeNull()
  })

  it("rejects staff and does not leak template body", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    mockResolveValue = { data: { body: "Secret body" }, error: null }

    const result = await loadBroadcastTemplate()
    expect(result.body).toBeNull()
    expect(result.error).toContain("Only admins")
  })

  it("preserves company_admin allowed behavior", async () => {
    mockResolveValue = { data: { body: "Hello {{customer_name}}" }, error: null }

    const result = await loadBroadcastTemplate()
    expect(result.body).toBe("Hello {{customer_name}}")
    expect(result.error).toBeUndefined()
  })
})

describe("confirmBroadcastSelected", () => {
  beforeEach(() => {
    mockResolveValue = { data: null, error: null }
    mockSendMessages.mockClear()
    mockChain.insert.mockClear()
  })

  it("rejects more than 50 selected IDs", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`)

    const result = await confirmBroadcastSelected("Hello", ids)
    expect(result.error).toContain("50")
    expect(result.success).toBe(false)
  })

  it("rejects empty message body", async () => {
    const result = await confirmBroadcastSelected("", ["some-id"])
    expect(result.error).toContain("empty")
    expect(result.success).toBe(false)
  })

  it("rejects empty selection", async () => {
    const result = await confirmBroadcastSelected("Hello", [])
    expect(result.error).toContain("No recipients")
    expect(result.success).toBe(false)
  })

  it("rejects non-company_admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await confirmBroadcastSelected("Hello", ["id-1"])
    expect(result.error).toContain("Only admins")
    expect(result.success).toBe(false)
  })

  it("skips invalid_number and opted_out recipients", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9681111", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9682222", policy_no: "P2", communication_status: "invalid_number" },
      { id: "c3", customer_name: "Carol", mobile_no: "+9683333", policy_no: "P3", communication_status: "opted_out" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await confirmBroadcastSelected("Hello", ["c1", "c2", "c3"])

    expect(result.success).toBe(true)
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    const sentRecipients = mockSendMessages.mock.calls[0][0]
    expect(sentRecipients).toHaveLength(1)
    expect(sentRecipients[0].mobile).toBe("+9681111")
  })

  it("sends only to allowed recipients and inserts correct message records", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9681111", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9682222", policy_no: "P2", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await confirmBroadcastSelected("Welcome {{customer_name}}!", ["c1", "c2"])

    expect(result.success).toBe(true)
    expect(result.sent).toBe(2)

    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    const sentRecipients = mockSendMessages.mock.calls[0][0]
    expect(sentRecipients).toHaveLength(2)

    expect(mockChain.insert).toHaveBeenCalledTimes(1)
    const insertedMessages = mockChain.insert.mock.calls[0][0]
    expect(insertedMessages).toHaveLength(2)
    expect(insertedMessages[0].customer_record_id).toBe("c1")
    expect(insertedMessages[0].message_body).toContain("Alice")
    expect(insertedMessages[0].message_type).toBe("broadcast")
    expect(insertedMessages[0].status).toBe("sent")
    expect(insertedMessages[1].customer_record_id).toBe("c2")
    expect(insertedMessages[1].message_body).toContain("Bob")
  })

  it("returns error when all selected recipients are ineligible", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9681111", policy_no: "P1", communication_status: "invalid_number" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9682222", policy_no: "P2", communication_status: "opted_out" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await confirmBroadcastSelected("Hello", ["c1", "c2"])

    expect(result.success).toBe(false)
    expect(result.error).toContain("No eligible recipients")
    expect(mockSendMessages).not.toHaveBeenCalled()
    expect(mockChain.insert).not.toHaveBeenCalled()
  })
})

describe("getBroadcastRecipientsPaginated", () => {
  beforeEach(() => {
    mockResolveValue = { data: null, error: null }
    mockChain.or.mockClear()
    mockChain.range.mockClear()
  })

  it("returns page 1 recipients", async () => {
    const customers = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`,
      customer_name: `Customer ${i}`,
      mobile_no: `+968000${i}`,
      policy_no: `POL${i}`,
      communication_status: "allowed",
    }))
    mockResolveValue = { data: customers, error: null }

    const result = await getBroadcastRecipientsPaginated("", 1)

    expect(result.recipients).toHaveLength(3)
    expect(result.hasMore).toBe(false)
    expect(result.recipients[0].customer_name).toBe("Customer 0")
  })

  it("returns hasMore when more than PAGE_SIZE", async () => {
    const customers = Array.from({ length: 51 }, (_, i) => ({
      id: `c${i}`,
      customer_name: `Customer ${i}`,
      mobile_no: `+968${String(i).padStart(4, "0")}`,
      policy_no: `POL${i}`,
      communication_status: "allowed",
    }))
    mockResolveValue = { data: customers, error: null }

    const result = await getBroadcastRecipientsPaginated("", 1)

    expect(result.recipients).toHaveLength(50)
    expect(result.hasMore).toBe(true)
  })

  it("searches using or with customer_name, mobile_no, policy_no", async () => {
    mockResolveValue = { data: [], error: null }

    await getBroadcastRecipientsPaginated("Salim", 1)

    expect(mockChain.or).toHaveBeenCalledTimes(1)
    const orArg = mockChain.or.mock.calls[0][0]
    expect(orArg).toContain("customer_name.ilike.%Salim%")
    expect(orArg).toContain("mobile_no.ilike.%Salim%")
    expect(orArg).toContain("policy_no.ilike.%Salim%")
  })

  it("returns empty when no match", async () => {
    const customers: any[] = []
    mockResolveValue = { data: customers, error: null }

    const result = await getBroadcastRecipientsPaginated("NoMatch", 1)

    expect(result.recipients).toHaveLength(0)
    expect(result.hasMore).toBe(false)
  })

  it("rejects non-company_admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await getBroadcastRecipientsPaginated("", 1)

    expect(result.recipients).toHaveLength(0)
    expect(result.hasMore).toBe(false)
  })
})
