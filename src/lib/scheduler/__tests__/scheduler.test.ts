import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runScheduler, addDaysToDate, isBirthdayDispatchDue } from "../run"

const BIRTHDAY_CONTENT_SID = `HX${"a".repeat(32)}`

const messagingMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  sendMessages: vi.fn(),
}))

let mockResolveValue: unknown = { data: null, error: null }
let mockResponseQueue: unknown[] = []
let mockFinalizeQueue: unknown[] = []

const mockFinalizeChain: Record<"eq" | "select", ReturnType<typeof vi.fn>> = {
  eq: vi.fn(() => mockFinalizeChain),
  select: vi.fn(() => Promise.resolve(mockFinalizeQueue.shift() ?? { data: [{ id: "message-id" }], error: null })),
}

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  gte: vi.fn(() => mockChain),
  lte: vi.fn(() => mockChain),
  lt: vi.fn(() => mockChain),
  not: vi.fn(() => mockChain),
  order: vi.fn(() => mockChain),
  range: vi.fn(() => mockChain),
  limit: vi.fn(() => mockChain),
  single: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
  maybeSingle: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
  insert: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? { error: null })),
  rpc: vi.fn((_name: string, args: Record<string, unknown>) => {
    const response = mockResponseQueue.shift() as { data?: unknown; error?: { code?: string; message?: string } | null } | undefined
    if (response?.error?.code === "23505") {
      return Promise.resolve({ data: [{ outcome: "duplicate" }], error: null })
    }
    if (response?.error) return Promise.resolve(response)
    if (response?.data) return Promise.resolve(response)
    return Promise.resolve({
      data: [{
        outcome: "claimed",
        idempotency_key: `birthday:${args.p_company_id}:${args.p_recipient_mobile}:${args.p_birthday_year}`,
      }],
      error: null,
    })
  }),
  update: vi.fn(() => mockFinalizeChain),
  then: vi.fn((onfulfilled: (value: unknown) => unknown) =>
    Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue).then(onfulfilled)),
}

vi.mock("@/lib/dates/muscat-day", () => ({
  getMuscatBusinessDayBounds: () => ({
    businessDate: "2026-06-19",
    startUtc: "2026-06-18T20:00:00.000Z",
    endUtcExclusive: "2026-06-19T20:00:00.000Z",
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockChain),
}))

vi.mock("@/lib/messaging/provider", () => ({
  getProvider: messagingMocks.getProvider,
}))

vi.mock("@/lib/messaging/send", () => ({
  sendMessages: messagingMocks.sendMessages,
}))

beforeEach(() => {
  process.env.BIRTHDAY_LIVE_SEND_ENABLED = "true"
  mockResponseQueue = []
  mockFinalizeQueue = []
  mockResolveValue = { data: null, error: null }
  vi.clearAllMocks()
  messagingMocks.getProvider.mockReturnValue({ name: "test-provider", send: vi.fn() })
  messagingMocks.sendMessages.mockImplementation(async (recipients: { mobile: string }[]) =>
    recipients.map((recipient, index) => ({
      success: true,
      providerMessageId: `SM${index + 1}`,
      deliveryStatus: "queued",
      mobile: recipient.mobile,
    })),
  )
})

afterEach(() => {
  delete process.env.BIRTHDAY_LIVE_SEND_ENABLED
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

describe("isBirthdayDispatchDue", () => {
  it("uses the Muscat company time in a bounded scheduler window", () => {
    const now = new Date("2026-06-19T05:05:00.000Z") // 09:05 Asia/Muscat
    expect(isBirthdayDispatchDue("09:00", "Asia/Muscat", now)).toBe(true)
    expect(isBirthdayDispatchDue("08:00", "Asia/Muscat", now)).toBe(false)
  })

  it("fails closed for unsupported timezones", () => {
    expect(isBirthdayDispatchDue("09:00", "UTC", new Date("2026-06-19T09:00:00Z"))).toBe(false)
  })
})

describe("runScheduler", () => {
  it("keeps real birthday dispatch behind the separate pre-live environment gate", async () => {
    delete process.env.BIRTHDAY_LIVE_SEND_ENABLED
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Birthday Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { is_enabled: true, template_id: "birthday-template", send_time: null, timezone: "Asia/Muscat" }, error: null },
    )

    const result = await runScheduler()

    expect(result.birthdaySent).toBe(0)
    expect(mockChain.rpc).not.toHaveBeenCalled()
    expect(messagingMocks.sendMessages).not.toHaveBeenCalled()
    process.env.BIRTHDAY_LIVE_SEND_ENABLED = "true"
  })

  it("returns zero when no active companies exist", async () => {
    mockResponseQueue.push({ data: [], error: null })

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(0)
    expect(result.renewalSent).toBe(0)
    expect(result.birthdaySent).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockChain.eq).toHaveBeenCalledWith("is_active", true)
  })

  it("fails before any claim or provider call when provider configuration is invalid", async () => {
    messagingMocks.getProvider.mockImplementationOnce(() => {
      throw new Error("Invalid live provider configuration")
    })

    await expect(runScheduler()).rejects.toThrow("Invalid live provider configuration")

    expect(mockChain.from).not.toHaveBeenCalled()
    expect(mockChain.insert).not.toHaveBeenCalled()
    expect(messagingMocks.sendMessages).not.toHaveBeenCalled()
  })

  it("processes one company with two renewal stages using exact matching", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Test Company" }], error: null },
      { data: { reminder_days: [14, 7], is_active: true }, error: null },
      { data: { body: "Renewal reminder for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03", veh_make_model: "Toyota" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(1)
    expect(result.renewalSent).toBe(1)
    expect(result.birthdaySent).toBe(0)
    expect(result.errors).toHaveLength(0)

    expect(mockChain.insert).toHaveBeenCalledTimes(1)
    const inserted = mockChain.insert.mock.calls[0][0]
    expect(inserted.customer_record_id).toBe("cust1")
    expect(inserted.reminder_stage).toBe(14)
    expect(inserted.message_type).toBe("renewal")
    expect(inserted.status).toBe("pending")
    expect(inserted.message_body).toContain("Ahmed")
    expect(inserted.idempotency_key).toBe("scheduler:renewal:c1:cust1:14:2026-06-19")
    expect(mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "sent",
      provider_message_id: "SM1",
      delivery_status: "queued",
      failure_reason: null,
    }))
  })

  it("moves a claimed message to failed when the provider rejects it", async () => {
    messagingMocks.sendMessages.mockResolvedValueOnce([
      { success: false, error: "Twilio unavailable", deliveryStatus: "failed", mobile: "+968111" },
    ])
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Failure Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(result.errors).toEqual([expect.stringContaining("Twilio unavailable")])
    expect(mockChain.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", sent_at: null }))
    expect(mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      provider_message_id: null,
      delivery_status: "failed",
      failure_reason: "Twilio unavailable",
      sent_at: null,
    }))
  })

  it("fails closed when provider acceptance has no provider identifier", async () => {
    messagingMocks.sendMessages.mockResolvedValueOnce([
      { success: true, deliveryStatus: "queued", mobile: "+968111" },
    ])
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Missing ID Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(result.errors[0]).toContain("without returning an identifier")
    expect(mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      provider_message_id: null,
      sent_at: null,
    }))
  })

  it("does not report sent when the tenant-scoped pending finalize matches no row", async () => {
    mockFinalizeQueue.push({ data: [], error: null })
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Finalize Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(result.errors[0]).toContain("claim finalization failed")
  })

  it("does not include customers from other stages (exact match proof)", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Test Co" }], error: null },
      { data: { reminder_days: [30, 14, 7], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust30", customer_name: "Thirty", mobile_no: "+96830", policy_expiry_date: "2026-07-19" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(1)
    expect(mockChain.insert).toHaveBeenCalledTimes(1)
    const inserted = mockChain.insert.mock.calls[0][0]
    expect(inserted.customer_record_id).toBe("cust30")
    expect(inserted.reminder_stage).toBe(30)
  })

  it("processes birthdays for today", async () => {

    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Birthday Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { is_enabled: true, template_id: "birthday-template", send_time: null, timezone: "Asia/Muscat" }, error: null },
      { data: { id: "birthday-template", body: "Happy Birthday {{customer_name}}!", name: "Birthday", provider_template_id: BIRTHDAY_CONTENT_SID, estimated_unit_cost_baisa: 50 }, error: null },
      { data: [{ id: "b1", customer_name: "Fatima", mobile_no: "+968222", driver_dob: "2000-06-19" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: { is_enabled: true }, error: null },
    )

    const result = await runScheduler()

    expect(result.birthdaySent).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockChain.rpc).toHaveBeenCalledTimes(1)
    const [, claim] = mockChain.rpc.mock.calls[0]
    expect(claim.p_customer_record_id).toBe("b1")
    expect(claim.p_company_id).toBe("c1")
    expect(claim.p_dispatch_source).toBe("automatic")
    expect(claim.p_birthday_year).toBe(2026)
    expect(messagingMocks.sendMessages).toHaveBeenCalledWith([expect.objectContaining({
      mobile: "+968222",
      template: {
        contentSid: BIRTHDAY_CONTENT_SID,
        variables: { "1": "Fatima", "2": "Birthday Co" },
      },
    })])
  })

  it("cancels a reserved birthday when automation is disabled before provider dispatch", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Birthday Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { is_enabled: true, template_id: "birthday-template", send_time: null, timezone: "Asia/Muscat" }, error: null },
      { data: { id: "birthday-template", body: "Happy Birthday {{customer_name}}!", name: "Birthday", provider_template_id: BIRTHDAY_CONTENT_SID, estimated_unit_cost_baisa: 50 }, error: null },
      { data: [{ id: "b1", customer_name: "Fatima", mobile_no: "+96891111111", driver_dob: "2000-06-19", communication_status: "allowed" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: { is_enabled: false }, error: null },
    )

    const result = await runScheduler()

    expect(result.birthdaySent).toBe(0)
    expect(messagingMocks.sendMessages).not.toHaveBeenCalled()
    expect(mockChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "canceled",
    }))
  })

  it("dedup: old message from another day does not block today's run", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Dedup Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { error: null },
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
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "No Template Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { is_enabled: true, template_id: "birthday-template", send_time: null, timezone: "Asia/Muscat" }, error: null },
      { data: { id: "birthday-template", body: "Happy Birthday!", name: "Birthday", provider_template_id: BIRTHDAY_CONTENT_SID, estimated_unit_cost_baisa: 50 }, error: null },
      { data: [{ id: "b1", customer_name: "Fatima", mobile_no: "+968222", driver_dob: "2000-06-19" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: { is_enabled: true }, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(0)
    expect(result.birthdaySent).toBe(1)
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

  it("keeps birthday automation disabled unless the independent setting is enabled", async () => {
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Manual Birthday Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { is_enabled: false, template_id: null }, error: null },
    )

    const result = await runScheduler()

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
      { error: null },
      { data: null, error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "b1", customer_name: "Bob", mobile_no: "+968222", policy_expiry_date: "2026-07-03" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.companiesProcessed).toBe(2)
    expect(result.renewalSent).toBe(2)
    expect(mockChain.insert).toHaveBeenCalledTimes(2)
    expect(mockFinalizeChain.eq).toHaveBeenCalledWith("company_id", "c1")
    expect(mockFinalizeChain.eq).toHaveBeenCalledWith("company_id", "c2")
    expect(mockFinalizeChain.eq).toHaveBeenCalledWith("idempotency_key", "scheduler:renewal:c1:a1:14:2026-06-19")
    expect(mockFinalizeChain.eq).toHaveBeenCalledWith("idempotency_key", "scheduler:renewal:c2:b1:14:2026-06-19")
    expect(mockFinalizeChain.eq).toHaveBeenCalledWith("status", "pending")
  })
})

// ─── Durable idempotency tests ───────────────────────────────
// These tests prove that the unique partial index on idempotency_key
// prevents duplicate dispatches when two Scheduler runs attempt to
// claim the same identity concurrently.

describe("scheduler durable idempotency", () => {
  /**
   * Helper: push a standard renewal run (1 company, 1 stage, 1 customer) into the mock queue.
   * Consumes 7 items: companies, settings, template, customers, existing, insert, birthday-template-null.
   * Returns the insert index position for assertions.
   * Override the insert response by passing extra items that will be consumed in place.
   */
  function pushRenewalRun(
    overrides?: { insertResult?: unknown; companyId?: string; custId?: string; stage?: number },
  ): void {
    const { insertResult = { error: null }, companyId = "c1", custId = "cust1", stage = 30 } = overrides ?? {}
    mockResponseQueue.push(
      { data: [{ id: companyId, name: "Test Co" }], error: null },
      { data: { reminder_days: [stage], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: custId, customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-19" }], error: null },
      { data: [], error: null },
      insertResult,
      { data: null, error: null },
    )
  }

  /**
   * Helper: push a standard birthday run (1 company, 1 customer) into the mock queue.
   * Consumes 8 items: companies, reminder settings, renewal-template-null,
   * birthday automation settings, birthday template, allCustomers, existing, insert.
   */
  function pushBirthdayRun(
    overrides?: { insertResult?: unknown; companyId?: string; custId?: string },
  ): void {
    const { insertResult = { error: null }, companyId = "c1", custId = "b1" } = overrides ?? {}
    mockResponseQueue.push(
      { data: [{ id: companyId, name: "Birthday Co" }], error: null },
      { data: { reminder_days: [14], is_active: true }, error: null },
      { data: null, error: null },
      { data: { is_enabled: true, template_id: "birthday-template", send_time: null, timezone: "Asia/Muscat" }, error: null },
      { data: { id: "birthday-template", body: "Happy Birthday {{customer_name}}!", name: "Birthday", provider_template_id: BIRTHDAY_CONTENT_SID, estimated_unit_cost_baisa: 50 }, error: null },
      { data: [{ id: custId, customer_name: "Fatima", mobile_no: "+968222", driver_dob: "2000-06-19" }], error: null },
      { data: [], error: null },
      insertResult,
      { data: { is_enabled: true }, error: null },
    )
  }

  it("concurrent renewal runs: unique-conflict loser skips without incrementing", async () => {
    // push 2 renewal runs — first wins, second hits idempotency unique conflict
    pushRenewalRun({ insertResult: { error: null } })
    pushRenewalRun({
      insertResult: {
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "idx_messages_idempotency_key"',
        },
      },
    })

    const result1 = await runScheduler()
    expect(result1.renewalSent).toBe(1)
    expect(result1.errors).toHaveLength(0)

    const result2 = await runScheduler()
    expect(result2.renewalSent).toBe(0)
    expect(result2.errors).toHaveLength(0)

    expect(mockChain.insert).toHaveBeenCalledTimes(2)
    expect(result1.renewalSent + result2.renewalSent).toBe(1)
  })

  it("concurrent birthday runs: unique-conflict loser skips without incrementing", async () => {
    pushBirthdayRun({ insertResult: { error: null } })
    pushBirthdayRun({
      insertResult: {
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "idx_messages_idempotency_key"',
        },
      },
    })

    const result1 = await runScheduler()
    expect(result1.birthdaySent).toBe(1)

    const result2 = await runScheduler()
    expect(result2.birthdaySent).toBe(0)

    expect(result1.birthdaySent + result2.birthdaySent).toBe(1)
  })

  it("different renewal stages produce different keys and remain independent", async () => {
    // 1 company, 2 stages [30,14], same customer both eligible for different stages
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Indep Co" }], error: null },
      { data: { reminder_days: [30, 14], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      // Stage 30
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-08-03" }], error: null },
      { data: [], error: null },
      { error: null },
      // Stage 14
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-19" }], error: null },
      { data: [], error: null },
      { error: null },
      // Birthday template — none
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(2)
    expect(result.errors).toHaveLength(0)

    const insertCalls = mockChain.insert.mock.calls
    expect(insertCalls).toHaveLength(2)
    const keys = insertCalls.map(
      ([row]) => (row as Record<string, unknown>).idempotency_key,
    )
    expect(keys).toContain("scheduler:renewal:c1:cust1:14:2026-06-19")
    expect(keys).toContain("scheduler:renewal:c1:cust1:30:2026-06-19")
    expect(new Set(keys).size).toBe(2)
  })

  it("different customer records produce different keys and remain independent", async () => {
    // 1 company, 1 stage [30], 2 customers both eligible
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Multi Co" }], error: null },
      { data: { reminder_days: [30], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      {
        data: [
          { id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-19" },
          { id: "cust2", customer_name: "Bader", mobile_no: "+968222", policy_expiry_date: "2026-07-19" },
        ],
        error: null,
      },
      { data: [], error: null },
      { error: null },
      { error: null },
      // Birthday template — none
      { data: null, error: null },
    )

    const result = await runScheduler()

    expect(result.renewalSent).toBe(2)
    expect(result.errors).toHaveLength(0)

    const insertCalls = mockChain.insert.mock.calls
    expect(insertCalls).toHaveLength(2)
    const keys = insertCalls.map(
      ([row]) => (row as Record<string, unknown>).idempotency_key,
    )
    expect(keys).toContain("scheduler:renewal:c1:cust1:30:2026-06-19")
    expect(keys).toContain("scheduler:renewal:c1:cust2:30:2026-06-19")
    expect(new Set(keys).size).toBe(2)
    expect(messagingMocks.sendMessages).toHaveBeenCalledTimes(1)
    expect(messagingMocks.sendMessages).toHaveBeenCalledWith([
      { mobile: "+968111", body: "Renewal for Ahmed" },
      { mobile: "+968222", body: "Renewal for Bader" },
    ])
  })

  it("a new Muscat business date creates a different idempotency identity", async () => {
    // Run 1: today's date (2026-06-19)
    mockResponseQueue.push(
      { data: [{ id: "c1", name: "Date Co" }], error: null },
      { data: { reminder_days: [30], is_active: true }, error: null },
      { data: { body: "Renewal for {{customer_name}}", name: "Renewal" }, error: null },
      { data: [{ id: "cust1", customer_name: "Ahmed", mobile_no: "+968111", policy_expiry_date: "2026-07-19" }], error: null },
      { data: [], error: null },
      { error: null },
      { data: null, error: null },
    )

    const result1 = await runScheduler()
    expect(result1.renewalSent).toBe(1)
    // Key for the first run
    const key1 = mockChain.insert.mock.calls[0][0].idempotency_key
    expect(key1).toContain("2026-06-19")
  })

  it("unrelated 23505 error is surfaced, not silently skipped", async () => {
    // A 23505 unique violation that does NOT come from the idempotency_key
    // index must be surfaced as a real error, not silently skipped.
    pushRenewalRun({
      insertResult: {
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "some_other_unique_idx"',
        },
      },
    })

    const result = await runScheduler()
    expect(result.renewalSent).toBe(0)
    // The error IS surfaced even though the plain PostgREST error object
    // isn't instanceof Error — the important thing is that the scheduler
    // did NOT silently skip it.
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("customer cust1")
  })

  it("unique-conflict loser never calls the provider", async () => {
    pushRenewalRun({ insertResult: { error: null } })
    pushRenewalRun({
      insertResult: {
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "idx_messages_idempotency_key"',
        },
      },
    })

    await runScheduler()
    await runScheduler()

    expect(mockChain.insert).toHaveBeenCalledTimes(2)
    const keys = mockChain.insert.mock.calls.map(
      ([row]) => (row as Record<string, unknown>).idempotency_key,
    )
    expect(keys[0]).toBe("scheduler:renewal:c1:cust1:30:2026-06-19")
    expect(keys[1]).toBe("scheduler:renewal:c1:cust1:30:2026-06-19")
    expect(messagingMocks.sendMessages).toHaveBeenCalledTimes(1)
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
