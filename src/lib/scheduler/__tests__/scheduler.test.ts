import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runScheduler, addDaysToDate } from "../run"

let mockResolveValue: any = { data: null, error: null }
let mockResponseQueue: any[] = []

const mockChain: any = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  gte: vi.fn(() => mockChain),
  lte: vi.fn(() => mockChain),
  not: vi.fn(() => mockChain),
  order: vi.fn(() => mockChain),
  range: vi.fn(() => mockChain),
  limit: vi.fn(() => mockChain),
  single: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
  maybeSingle: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
  insert: vi.fn(() => Promise.resolve({ error: null })),
  then: vi.fn((onfulfilled: any) =>
    Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue).then(onfulfilled)),
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockChain),
}))

beforeEach(() => {
  mockResponseQueue = []
  mockResolveValue = { data: null, error: null }
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("addDaysToDate", () => {
  it("adds 30 days to a date", () => {
    expect(addDaysToDate("2026-06-19", 30)).toBe("2026-07-19")
  })

  it("adds 0 days returns the same date", () => {
    expect(addDaysToDate("2026-06-19", 0)).toBe("2026-06-19")
  })

  it("crosses year boundary", () => {
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("handles leap year February", () => {
    expect(addDaysToDate("2024-02-28", 1)).toBe("2024-02-29")
  })
})

describe("runScheduler", () => {
  it("returns zero when no active companies exist", async () => {
    mockResponseQueue.push({ data: [], error: null })

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(0)
    expect(result.renewalSent).toBe(0)
    expect(result.birthdaySent).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("processes one company with two renewal stages using exact matching", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Test Company" }], error: null },
      { data: { reminder_days: [14, 7], is_active: true }, error: null },
      { data: { body: "Renewal reminder for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03", veh_make_model: "Toyota" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    )

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(1)
    expect(result.renewalSent).toBe(1)
    expect(result.birthdaySent).toBe(0)
    expect(result.errors).toHaveLength(0)

    expect(mockChain.insert).toHaveBeenCalledTimes(1)
    const inserted = mockChain.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(1)
    expect(inserted[0].customer_record_id).toBe("cust1")
    expect(inserted[0].reminder_stage).toBe(14)
    expect(inserted[0].message_type).toBe("renewal")
    expect(inserted[0].status).toBe("sent")
    expect(inserted[0].message_body).toContain("Ahmed")
  })

  it("does not include customers from other stages (exact match proof)", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Test Co" }], error: null },
      { data: { reminder_days: [30, 14, 7], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust30", customer_name: "Thirty", mobile_no: "+96830", policy_expiry_date: "2026-07-19" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(1)
    expect(mockChain.insert).toHaveBeenCalledTimes(1)
    const inserted = mockChain.insert.mock.calls[0][0]
    expect(inserted[0].customer_record_id).toBe("cust30")
    expect(inserted[0].reminder_stage).toBe(30)
  })

  it("processes birthdays for today", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-19T00:00:00+04:00"))

    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Birthday Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { body: "Happy Birthday {{customer_name}}!", name: "Birthday" }, error: null },
      { data: [{ id: "b1", customer_name: "Fatima", mobile_no: "+968222", driver_dob: "2000-06-19" }], error: null },
      { data: [], error: null },
    )

    const result = await runScheduler()

    expect(result.birthdaySent).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockChain.insert).toHaveBeenCalledTimes(1)
    const inserted = mockChain.insert.mock.calls[0][0]
    expect(inserted[0].customer_record_id).toBe("b1")
    expect(inserted[0].message_type).toBe("birthday")
    expect(inserted[0].status).toBe("sent")

    vi.useRealTimers()
  })

  it("dedup: old message from another day does not block today's run", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Dedup Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(1)
    expect(mockChain.insert).toHaveBeenCalledTimes(1)
  })

  it("dedup: same-day rerun skips already-processed customers", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Dedup Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [{ customer_record_id: "cust1" }], error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  it("excludes opted_out and invalid_number customers", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Filter Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [], error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  it("skips renewals when no renewal template exists", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-19T00:00:00+04:00"))

    mockResponseQueue.push(
      { data: [{ id: "c1", name: "No Template Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { body: "Happy Birthday!", name: "Birthday" }, error: null },
      { data: [{ id: "b1", customer_name: "Fatima", mobile_no: "+968222", driver_dob: "2000-06-19" }], error: null },
      { data: [], error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(result.birthdaySent).toBe(1)

    vi.useRealTimers()
  })

  it("skips company when reminder_settings is inactive", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Inactive Co" }], error: null },
      { data: { reminder_days: [14], is_active: false }, error: null },
    )

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(1)
    expect(result.renewalSent).toBe(0)
    expect(result.birthdaySent).toBe(0)
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  it("processes two active companies independently", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Co A" }, { id: "c2", name: "Co B" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "a1", customer_name: "Alice", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { data: null, error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "b1", customer_name: "Bob", mobile_no: "+968222", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(2)
    expect(result.renewalSent).toBe(2)
    expect(mockChain.insert).toHaveBeenCalledTimes(2)
  })
})

describe("scheduler API route", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns 401 when CRON_SECRET is wrong", async () => {
    process.env.CRON_SECRET = "correct-secret"

    const { GET } = await import("@/app/api/cron/scheduler/route")
    const request = new Request("http://localhost:3000/api/cron/scheduler", {
      headers: { "x-cron-secret": "wrong-secret" },
    })
    const response = await GET(request)

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe("Unauthorized")
  })

  it("returns 200 with valid Bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret"
    mockResponseQueue.push(
      { data: [], error: null },
    )

    const { GET } = await import("@/app/api/cron/scheduler/route")
    const request = new Request("http://localhost:3000/api/cron/scheduler", {
      headers: { authorization: "Bearer correct-secret" },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.companiesProcessed).toBe(0)
  })
})
