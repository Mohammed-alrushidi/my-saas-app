import { describe, it, expect, vi, beforeEach } from "vitest"

import { revalidatePath } from "next/cache"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockResolveValue: any = { data: null, error: null }
let mockResponseQueue: any[] = []

function createQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
    range: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
    insert: vi.fn(() => Promise.resolve({ error: null })),
    maybeSingle: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
    single: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
    then: vi.fn((onfulfilled: any) =>
      Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue).then(onfulfilled)),
  }
  return builder
}

const mockChain: any = {
  from: vi.fn(() => createQueryBuilder()),
  auth: {
    getUser: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
  },
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

beforeEach(() => {
  mockResponseQueue = []
  mockResolveValue = { data: null, error: null }
  vi.clearAllMocks()
})

import { previewRenewal, confirmRenewal, getMessageHistory, previewBirthdays, confirmBirthdays, previewBroadcast, confirmBroadcast } from "@/app/dashboard/messages/actions"

describe("previewRenewal", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await previewRenewal(30)
    expect(result.error).toContain("Only admins")
    expect(result.count).toBe(0)
  })

  it("rejects invalid reminder day", async () => {
    mockResolveValue = { data: { reminder_days: [14, 7] }, error: null }

    const result = await previewRenewal(30)
    expect(result.error).toContain("Invalid reminder day")
    expect(result.count).toBe(0)
  })

  it("returns sample messages when eligible customers exist", async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 30 * 86400000)
    const futureStr = futureDate.toISOString().split("T")[0]

    const mockCustomers = [
      { id: "c1", customer_name: "Ahmed", mobile_no: "+96891111111", policy_expiry_date: futureStr, veh_make_model: "Toyota Camry" },
      { id: "c2", customer_name: "Fatima", mobile_no: "+96892222222", policy_expiry_date: futureStr },
      { id: "c3", customer_name: "Said", mobile_no: "+96893333333", policy_expiry_date: futureStr },
    ]

    const mockTemplate = {
      body: "Hi {{customer_name}}, your {{veh_make_model}} policy is expiring. - {{company_name}}",
      name: "Renewal Reminder",
    }

    mockResponseQueue.push(
      { data: { reminder_days: [14, 30] }, error: null },
      { count: 3, data: null, error: null },
      { data: mockCustomers, error: null },
      { data: [], error: null },
      { data: mockTemplate, error: null },
    )

    const result = await previewRenewal(30)

    expect(result.error).toBeUndefined()
    expect(result.count).toBe(3)
    expect(result.sample).toHaveLength(3)
    expect(result.sample[0].mobile).toBe("+96891111111")
    expect(result.sample[0].body).toContain("Ahmed")
    expect(result.sample[0].body).toContain("Toyota Camry")
    expect(result.sample[0].body).toContain("Test Company")
    expect(result.sample[1].mobile).toBe("+96892222222")
    expect(result.sample[1].body).toContain("Fatima")
    expect(result.sample[2].mobile).toBe("+96893333333")
    expect(result.sample[2].body).toContain("Said")
  })
})

describe("confirmRenewal", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await confirmRenewal(30)
    expect(result.error).toContain("Only admins")
    expect(result.success).toBe(false)
  })

  it("sends messages and inserts records when eligible customers exist", async () => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + 30 * 86400000)
    const futureStr = futureDate.toISOString().split("T")[0]

    const mockCustomers = [
      { id: "c1", customer_name: "Ahmed", mobile_no: "+96891111111", policy_expiry_date: futureStr, veh_make_model: "Toyota Camry" },
      { id: "c2", customer_name: "Fatima", mobile_no: "+96892222222", policy_expiry_date: futureStr },
      { id: "c3", customer_name: "Said", mobile_no: "+96893333333", policy_expiry_date: futureStr },
    ]

    const mockTemplate = {
      body: "Hi {{customer_name}}, your {{veh_make_model}} policy is expiring. - {{company_name}}",
      name: "Renewal Reminder",
    }

    mockResponseQueue.push(
      { data: { reminder_days: [14, 30] }, error: null },
      { count: 3, data: null, error: null },
      { data: mockCustomers, error: null },
      { data: [], error: null },
      { data: mockTemplate, error: null },
    )

    const result = await confirmRenewal(30)

    expect(result.success).toBe(true)
    expect(result.sent).toBe(3)
    expect(result.skipped).toBe(0)
    expect(result.error).toBeUndefined()

    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    const recipients = mockSendMessages.mock.calls[0][0]
    expect(recipients).toHaveLength(3)
    expect(recipients[0].mobile).toBe("+96891111111")
    expect(recipients[0].body).toContain("Ahmed")
    expect(recipients[0].body).toContain("Test Company")
    expect(recipients[1].mobile).toBe("+96892222222")
    expect(recipients[2].mobile).toBe("+96893333333")

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/messages")

    const insertBuilder = mockChain.from.mock.results.at(-1)!.value
    const inserted = insertBuilder.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(3)
    expect(inserted[0].customer_record_id).toBe("c1")
    expect(inserted[0].message_type).toBe("renewal")
    expect(inserted[0].status).toBe("sent")
    expect(inserted[0].provider_message_id).toBe("mock-sid")
    expect(inserted[0].reminder_stage).toBe(30)
    expect(inserted[2].customer_record_id).toBe("c3")
  })
})

describe("getMessageHistory", () => {
  it("returns 50 messages and hasMore true when supabase returns 51 rows", async () => {
    const mockRows = Array.from({ length: 51 }, (_, i) => ({
      id: `msg-${i + 1}`,
      customer_records: { customer_name: `Customer ${i + 1}` },
      message_type: "renewal",
      recipient_mobile: "+9689000000",
      status: "sent",
      template_used: null,
      message_body: "Test",
      failure_reason: null,
      reminder_stage: null,
      sent_at: null,
      created_at: new Date().toISOString(),
      provider_message_id: null,
      delivery_status: null,
    }))

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory()

    expect(result.messages).toHaveLength(50)
    expect(result.hasMore).toBe(true)
    expect(result.messages[0].customer_name).toBe("Customer 1")
    expect(result.messages[49].customer_name).toBe("Customer 50")

    const rangeBuilder = mockChain.from.mock.results.at(-1)!.value
    expect(rangeBuilder.range).toHaveBeenCalledWith(0, 50)
  })

  it("returns page 2 with 12 messages and hasMore false when fewer than 51 rows", async () => {
    const mockRows = Array.from({ length: 12 }, (_, i) => ({
      id: `p2-msg-${i + 1}`,
      customer_records: { customer_name: `Page2 Customer ${i + 1}` },
      message_type: "renewal",
      recipient_mobile: "+9689000000",
      status: "sent",
      template_used: null,
      message_body: "Test",
      failure_reason: null,
      reminder_stage: null,
      sent_at: null,
      created_at: new Date().toISOString(),
      provider_message_id: null,
      delivery_status: null,
    }))

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory(undefined, undefined, 2)

    expect(result.messages).toHaveLength(12)
    expect(result.hasMore).toBe(false)
    expect(result.messages[0].customer_name).toBe("Page2 Customer 1")
    expect(result.messages[11].customer_name).toBe("Page2 Customer 12")

    const rangeBuilder = mockChain.from.mock.results.at(-1)!.value
    expect(rangeBuilder.range).toHaveBeenCalledWith(50, 100)
  })

  it("filters by message type when messageType param is provided", async () => {
    const now = new Date().toISOString()
    const mockRows = [
      {
        id: "m1", customer_records: { customer_name: "Ahmed" },
        message_type: "birthday", recipient_mobile: "+96891111111",
        status: "sent", template_used: null, message_body: "Test",
        failure_reason: null, reminder_stage: null, sent_at: null,
        created_at: now, provider_message_id: null, delivery_status: null,
      },
      {
        id: "m2", customer_records: { customer_name: "Fatima" },
        message_type: "birthday", recipient_mobile: "+96892222222",
        status: "failed", template_used: null, message_body: "Test",
        failure_reason: "error", reminder_stage: null, sent_at: null,
        created_at: now, provider_message_id: null, delivery_status: null,
      },
    ]

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory("birthday")

    expect(result.messages).toHaveLength(2)
    expect(result.hasMore).toBe(false)
    expect(result.messages[0].customer_name).toBe("Ahmed")
    expect(result.messages[1].customer_name).toBe("Fatima")

    const builder = mockChain.from.mock.results.at(-1)!.value
    expect(builder.eq).toHaveBeenCalledWith("message_type", "birthday")
  })

  it("filters by status when status param is provided", async () => {
    const now = new Date().toISOString()
    const mockRows = [
      {
        id: "m1", customer_records: { customer_name: "Ahmed" },
        message_type: "renewal", recipient_mobile: "+96891111111",
        status: "sent", template_used: null, message_body: "Test",
        failure_reason: null, reminder_stage: null, sent_at: null,
        created_at: now, provider_message_id: null, delivery_status: null,
      },
    ]

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory(undefined, "sent")

    expect(result.messages).toHaveLength(1)
    expect(result.hasMore).toBe(false)
    expect(result.messages[0].customer_name).toBe("Ahmed")

    const builder = mockChain.from.mock.results.at(-1)!.value
    expect(builder.eq).toHaveBeenCalledWith("status", "sent")
  })

  it("applies both message type and status filters together", async () => {
    const now = new Date().toISOString()
    const mockRows = [
      {
        id: "m1", customer_records: { customer_name: "Ahmed" },
        message_type: "birthday", recipient_mobile: "+96891111111",
        status: "sent", template_used: null, message_body: "Test",
        failure_reason: null, reminder_stage: null, sent_at: null,
        created_at: now, provider_message_id: null, delivery_status: null,
      },
    ]

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory("birthday", "sent")

    expect(result.messages).toHaveLength(1)
    expect(result.hasMore).toBe(false)

    const builder = mockChain.from.mock.results.at(-1)!.value
    expect(builder.eq).toHaveBeenCalledWith("message_type", "birthday")
    expect(builder.eq).toHaveBeenCalledWith("status", "sent")
  })

  it("skips message_type filter when type is 'all'", async () => {
    const now = new Date().toISOString()
    const mockRows = [
      {
        id: "m1", customer_records: { customer_name: "Ahmed" },
        message_type: "renewal", recipient_mobile: "+96891111111",
        status: "sent", template_used: null, message_body: "Test",
        failure_reason: null, reminder_stage: null, sent_at: null,
        created_at: now, provider_message_id: null, delivery_status: null,
      },
    ]

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory("all")

    expect(result.messages).toHaveLength(1)

    const builder = mockChain.from.mock.results.at(-1)!.value
    expect(builder.eq).toHaveBeenCalledWith("company_id", "test-company-id")
    expect(builder.eq).not.toHaveBeenCalledWith("message_type", "all")
  })

  it("skips status filter when status is 'all'", async () => {
    const now = new Date().toISOString()
    const mockRows = [
      {
        id: "m1", customer_records: { customer_name: "Ahmed" },
        message_type: "renewal", recipient_mobile: "+96891111111",
        status: "sent", template_used: null, message_body: "Test",
        failure_reason: null, reminder_stage: null, sent_at: null,
        created_at: now, provider_message_id: null, delivery_status: null,
      },
    ]

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory(undefined, "all")

    expect(result.messages).toHaveLength(1)

    const builder = mockChain.from.mock.results.at(-1)!.value
    expect(builder.eq).toHaveBeenCalledWith("company_id", "test-company-id")
    expect(builder.eq).not.toHaveBeenCalledWith("status", "all")
  })

  it("returns hasMore true on page 2 when supabase returns 51 rows", async () => {
    const mockRows = Array.from({ length: 51 }, (_, i) => ({
      id: `p2-msg-${i + 1}`,
      customer_records: { customer_name: `Customer ${i + 1}` },
      message_type: "renewal",
      recipient_mobile: "+9689000000",
      status: "sent",
      template_used: null,
      message_body: "Test",
      failure_reason: null,
      reminder_stage: null,
      sent_at: null,
      created_at: new Date().toISOString(),
      provider_message_id: null,
      delivery_status: null,
    }))

    mockResponseQueue.push({ data: mockRows, error: null })

    const result = await getMessageHistory(undefined, undefined, 2)

    expect(result.messages).toHaveLength(50)
    expect(result.hasMore).toBe(true)
    expect(result.messages[0].customer_name).toBe("Customer 1")
    expect(result.messages[49].customer_name).toBe("Customer 50")

    const rangeBuilder = mockChain.from.mock.results.at(-1)!.value
    expect(rangeBuilder.range).toHaveBeenCalledWith(50, 100)
  })
})

describe("previewBirthdays", () => {
  it("returns sample messages for today's birthdays only", async () => {
    const now = new Date()
    const monthStr = String(now.getMonth() + 1).padStart(2, "0")
    const dayStr = String(now.getDate()).padStart(2, "0")

    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const nonMatchMonth = String(tomorrow.getMonth() + 1).padStart(2, "0")
    const nonMatchDay = String(tomorrow.getDate()).padStart(2, "0")

    const mockCustomers = [
      { id: "c1", customer_name: "Ahmed", mobile_no: "+96891111111", driver_dob: `2000-${monthStr}-${dayStr}`, communication_status: "allowed" },
      { id: "c2", customer_name: "Fatima", mobile_no: "+96892222222", driver_dob: `1995-${monthStr}-${dayStr}`, communication_status: "allowed" },
      { id: "c3", customer_name: "Said", mobile_no: "+96893333333", driver_dob: `2000-${nonMatchMonth}-${nonMatchDay}`, communication_status: "allowed" },
    ]

    const mockTemplate = {
      body: "Happy birthday {{customer_name}}! - {{company_name}}",
      name: "Birthday Greeting",
    }

    mockResponseQueue.push(
      { data: { user: { id: "test-user-id" } }, error: null },
      { data: { id: "test-user-id", company_id: "test-company-id", role: "company_admin", companies: { name: "Test Company" } }, error: null },
      { data: mockTemplate, error: null },
      { data: mockCustomers, error: null },
      { data: [], error: null },
    )

    const result = await previewBirthdays()

    expect(result.error).toBeUndefined()
    expect(result.count).toBe(2)
    expect(result.sample).toHaveLength(2)

    const ahmed = result.sample.find(s => s.mobile === "+96891111111")
    expect(ahmed).toBeDefined()
    expect(ahmed!.body).toContain("Ahmed")
    expect(ahmed!.body).toContain("Test Company")

    const fatima = result.sample.find(s => s.mobile === "+96892222222")
    expect(fatima).toBeDefined()
    expect(fatima!.body).toContain("Fatima")
    expect(fatima!.body).toContain("Test Company")

    expect(mockSendMessages).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("confirmBirthdays", () => {
  it("sends birthday messages to eligible customers and inserts records", async () => {
    const now = new Date()
    const monthStr = String(now.getMonth() + 1).padStart(2, "0")
    const dayStr = String(now.getDate()).padStart(2, "0")

    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const nonMatchMonth = String(tomorrow.getMonth() + 1).padStart(2, "0")
    const nonMatchDay = String(tomorrow.getDate()).padStart(2, "0")

    const mockCustomers = [
      { id: "c1", customer_name: "Ahmed", mobile_no: "+96891111111", driver_dob: `2000-${monthStr}-${dayStr}`, communication_status: "allowed" },
      { id: "c2", customer_name: "Fatima", mobile_no: "+96892222222", driver_dob: `1995-${monthStr}-${dayStr}`, communication_status: "allowed" },
      { id: "c3", customer_name: "Said", mobile_no: "+96893333333", driver_dob: `2000-${nonMatchMonth}-${nonMatchDay}`, communication_status: "allowed" },
    ]

    const mockTemplate = {
      body: "Happy birthday {{customer_name}}! - {{company_name}}",
      name: "Birthday Greeting",
    }

    mockResponseQueue.push(
      { data: { user: { id: "test-user-id" } }, error: null },
      { data: { id: "test-user-id", company_id: "test-company-id", role: "company_admin", companies: { name: "Test Company" } }, error: null },
      { data: mockTemplate, error: null },
      { data: mockCustomers, error: null },
      { data: [], error: null },
    )

    const result = await confirmBirthdays()

    expect(result.success).toBe(true)
    expect(result.sent).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.error).toBeUndefined()

    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    const recipients = mockSendMessages.mock.calls[0][0]
    expect(recipients).toHaveLength(2)

    const ahmedR = recipients.find((r: any) => r.mobile === "+96891111111")
    expect(ahmedR).toBeDefined()
    expect(ahmedR.body).toContain("Ahmed")
    expect(ahmedR.body).toContain("Test Company")

    const fatimaR = recipients.find((r: any) => r.mobile === "+96892222222")
    expect(fatimaR).toBeDefined()
    expect(fatimaR.body).toContain("Fatima")
    expect(fatimaR.body).toContain("Test Company")

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/messages")

    const insertBuilder = mockChain.from.mock.results.at(-1)!.value
    const inserted = insertBuilder.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(2)
    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        customer_record_id: "c1",
        company_id: "test-company-id",
        recipient_mobile: "+96891111111",
        message_type: "birthday",
        status: "sent",
        provider_message_id: "mock-sid",
        template_used: "Birthday Greeting",
      }),
      expect.objectContaining({
        customer_record_id: "c2",
        company_id: "test-company-id",
        recipient_mobile: "+96892222222",
        message_type: "birthday",
        status: "sent",
        provider_message_id: "mock-sid",
        template_used: "Birthday Greeting",
      }),
    ]))
  })
})

describe("previewBroadcast", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await previewBroadcast("any body")

    expect(result.error).toContain("Only admins")
    expect(result.count).toBe(0)
  })
})

describe("confirmBroadcast", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await confirmBroadcast("any body")

    expect(result.error).toContain("Only admins")
    expect(result.success).toBe(false)
  })
})

describe("previewBirthdays", () => {
  it("rejects non-admin role", async () => {
    mockResponseQueue.push(
      { data: { user: { id: "test-user-id" } }, error: null },
      { data: { id: "test-user-id", company_id: "test-company-id", role: "staff", companies: { name: "Test Company" } }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    )

    const result = await previewBirthdays()

    expect(result.error).toContain("Only admins")
    expect(result.count).toBe(0)
  })
})

describe("confirmBirthdays", () => {
  it("rejects non-admin role", async () => {
    mockResponseQueue.push(
      { data: { user: { id: "test-user-id" } }, error: null },
      { data: { id: "test-user-id", company_id: "test-company-id", role: "staff", companies: { name: "Test Company" } }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    )

    const result = await confirmBirthdays()

    expect(result.error).toContain("Only admins")
    expect(result.success).toBe(false)
  })
})
