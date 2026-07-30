import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockResolveValue: any = { data: null, error: null }

/** For testing broadcast_submissions insert failure (e.g. 23505 duplicate). */
let mockInsertError: any = null

/** Override for the single() return value (takes precedence over mockResolveValue). */
let mockSingleReturn: { data: any; error: any } | null = null

/** For controlling the update response on broadcast_submissions. */
let mockUpdateError: any = null

const mockUpdateChain: any = {
  eq: vi.fn(() => mockUpdateChain),
  then: vi.fn((onfulfilled: any) =>
    Promise.resolve({ error: mockUpdateError }).then(onfulfilled),
  ),
}

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
  insert: vi.fn(() => {
    if (mockInsertError) return Promise.resolve({ error: mockInsertError })
    return Promise.resolve({ error: null })
  }),
  maybeSingle: vi.fn(() => Promise.resolve(mockResolveValue)),
  single: vi.fn(() => {
    if (mockSingleReturn) return Promise.resolve(mockSingleReturn)
    return Promise.resolve(mockResolveValue)
  }),
  /** update returns a chainable thenable for .eq().eq() patterns */
  update: vi.fn(() => mockUpdateChain),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

const mockGetProfile = vi.fn(() => ({
  id: "test-user-id",
  company_id: "test-company-id",
  role: "company_admin",
  is_active: true,
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

import {
  loadBroadcastTemplate,
  getBroadcastRecipientsPaginated,
  confirmBroadcastSelected,
  computePayloadHash,
} from "@/app/dashboard/broadcast/actions"

const TEST_SUB_ID = "00000000-0000-0000-0000-000000000000"

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

  it("rejects staff without broadcast:create grant", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      is_active: true,
      companies: { name: "Test Company" },
    })

    const result = await loadBroadcastTemplate()
    expect(result.body).toBeNull()
    expect(result.error).toContain("permission to prepare")
  })

  it("allows staff with broadcast:create grant to load template", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      is_active: true,
      companies: { name: "Test Company" },
    })
    mockResolveValue = { data: { id: "grant-1", body: "Hello {{customer_name}}" }, error: null }

    const result = await loadBroadcastTemplate()
    expect(result.body).toBe("Hello {{customer_name}}")
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
    mockInsertError = null
    mockSingleReturn = null
    mockUpdateError = null
    mockSendMessages.mockClear()
    mockChain.insert.mockClear()
    mockChain.insert.mockImplementation(() => {
      if (mockInsertError) return Promise.resolve({ error: mockInsertError })
      return Promise.resolve({ error: null })
    })
    mockChain.single.mockClear()
    mockChain.update.mockClear()
    mockUpdateChain.eq.mockClear()
  })

  // ── Existing validation tests (unchanged — fail before submissionId check) ──

  it("rejects more than 50 selected IDs", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`)

    const result = await confirmBroadcastSelected("Hello", ids, TEST_SUB_ID)
    expect(result.error).toContain("50")
    expect(result.success).toBe(false)
  })

  it("rejects empty message body", async () => {
    const result = await confirmBroadcastSelected("", ["some-id"], TEST_SUB_ID)
    expect(result.error).toContain("empty")
    expect(result.success).toBe(false)
  })

  it("rejects empty selection", async () => {
    const result = await confirmBroadcastSelected("Hello", [], TEST_SUB_ID)
    expect(result.error).toContain("No recipients")
    expect(result.success).toBe(false)
  })

  it("rejects non-company_admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      is_active: true,
      companies: { name: "Test Company" },
    })

    const result = await confirmBroadcastSelected("Hello", ["id-1"], TEST_SUB_ID)
    expect(result.error).toContain("Only admins")
    expect(result.success).toBe(false)
  })

  it("rejects staff with broadcast:create grant from sending", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      is_active: true,
      companies: { name: "Test Company" },
    })

    const result = await confirmBroadcastSelected("Hello", ["id-1"], TEST_SUB_ID)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })

  // ── Tests that reach the claim layer (require valid submissionId) ──

  it("skips invalid_number and opted_out recipients", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "invalid_number" },
      { id: "c3", customer_name: "Carol", mobile_no: "+9****33", policy_no: "P3", communication_status: "opted_out" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await confirmBroadcastSelected("Hello", ["c1", "c2", "c3"], TEST_SUB_ID)

    expect(result.success).toBe(true)
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    const sentRecipients = mockSendMessages.mock.calls[0][0]
    expect(sentRecipients).toHaveLength(1)
    expect(sentRecipients[0].mobile).toBe("+9****11")
  })

  it("sends only to allowed recipients and inserts correct message records", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await confirmBroadcastSelected("Welcome {{customer_name}}!", ["c1", "c2"], TEST_SUB_ID)

    expect(result.success).toBe(true)
    expect(result.sent).toBe(2)

    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    const sentRecipients = mockSendMessages.mock.calls[0][0]
    expect(sentRecipients).toHaveLength(2)

    // Verify messages insert was called
    const insertCalls = mockChain.insert.mock.calls
    // First insert is broadcast_submissions claim, second is messages
    const messagesCall = insertCalls.find((args: any[]) => Array.isArray(args[0]))
    expect(messagesCall).toBeDefined()
    const insertedMessages = messagesCall![0]
    expect(insertedMessages).toHaveLength(2)
    expect(insertedMessages[0].customer_record_id).toBe("c1")
    expect(insertedMessages[0].message_body).toContain("Alice")
    expect(insertedMessages[0].message_type).toBe("broadcast")
    expect(insertedMessages[0].status).toBe("sent")
    expect(insertedMessages[1].customer_record_id).toBe("c2")
    expect(insertedMessages[1].message_body).toContain("Bob")
  })

  it("sets mock=true when provider returns mock- prefixed IDs", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }
    mockSendMessages.mockResolvedValueOnce([
      { success: true, providerMessageId: "mock-abc123" },
    ])

    const result = await confirmBroadcastSelected("Hello", ["c1"], TEST_SUB_ID)

    expect(result.success).toBe(true)
    expect(result.mock).toBe(true)
    expect(result.sent).toBe(1)
  })

  it("returns error when all selected recipients are ineligible", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "invalid_number" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "opted_out" },
    ]
    mockResolveValue = { data: customers, error: null }

    // Must pass a valid submissionId to reach the eligibility check
    const result = await confirmBroadcastSelected("Hello", ["c1", "c2"], TEST_SUB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toContain("No eligible recipients")
    expect(mockSendMessages).not.toHaveBeenCalled()
    // Claim should NOT be made when no eligible recipients
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  // ── Idempotency tests ──

  it("rejects sequential replay after completed — same ID called twice", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "allowed" },
    ]
    const submissionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    // First call — succeeds normally
    mockResolveValue = { data: customers, error: null }
    const firstResult = await confirmBroadcastSelected("Hello", ["c1", "c2"], submissionId)
    expect(firstResult.success).toBe(true)
    expect(firstResult.sent).toBe(2)
    expect(mockSendMessages).toHaveBeenCalledTimes(1)

    // Second call with same submission ID — must fail with duplicate
    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }

    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1", "c2"]),
        status: "completed",
        recipient_count: 2,
        sent_count: 2,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const secondResult = await confirmBroadcastSelected("Hello", ["c1", "c2"], submissionId)
    expect(secondResult.alreadySubmitted).toBe(true)
    expect(secondResult.submissionStatus).toBe("completed")
    expect(secondResult.success).toBe(true)
    // sendMessages must NOT be called again
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
  })

  it("rejects sequential replay — second request never calls provider", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    // First call succeeds
    mockResolveValue = { data: customers, error: null }
    await confirmBroadcastSelected("Hello", ["c1"], submissionId)

    // Reset and simulate duplicate
    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    await confirmBroadcastSelected("Hello", ["c1"], submissionId)
    // sendMessages must still have been called only once
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
  })

  it("rejects replay of a completed submission with the same ID", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "cccccccc-cccc-cccc-cccc-cccccccccccc"

    // First call
    mockResolveValue = { data: customers, error: null }
    await confirmBroadcastSelected("Hello", ["c1"], submissionId)

    // Replay
    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const replayResult = await confirmBroadcastSelected("Hello", ["c1"], submissionId)
    expect(replayResult.alreadySubmitted).toBe(true)
    expect(replayResult.success).toBe(true) // completed = already successful
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
  })

  it("allows different submission ID for identical body and recipients", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]

    // First broadcast with sub-id-1
    mockResolveValue = { data: customers, error: null }
    const firstResult = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1")
    expect(firstResult.success).toBe(true)

    // Second broadcast with sub-id-2 for identical content
    mockResolveValue = { data: customers, error: null }
    const secondResult = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2")
    expect(secondResult.success).toBe(true)
    expect(mockSendMessages).toHaveBeenCalledTimes(2)
  })

  it("detects payload mismatch — same submission ID with different body", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "dddddddd-dddd-dddd-dddd-dddddddddddd"

    // First call with body "Hello"
    mockResolveValue = { data: customers, error: null }
    const firstHash = await computePayloadHash("Hello", ["c1"])
    await confirmBroadcastSelected("Hello", ["c1"], submissionId)

    // Duplicate with same submissionId but different body "Goodbye"
    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    // Return the first hash (from original call) so it mismatches the new payload
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: firstHash,
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const mismatchResult = await confirmBroadcastSelected("Goodbye", ["c1"], submissionId)
    expect(mismatchResult.payloadMismatch).toBe(true)
    expect(mismatchResult.alreadySubmitted).toBe(true)
    expect(mismatchResult.success).toBe(false)
    expect(mockSendMessages).toHaveBeenCalledTimes(1) // Provider called only for first
  })

  it("detects payload mismatch — same submission ID with different recipients", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "allowed" },
    ]
    const submissionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"

    // First call with ["c1"]
    mockResolveValue = { data: customers.slice(0, 1), error: null }
    const firstHash = await computePayloadHash("Hello", ["c1"])
    await confirmBroadcastSelected("Hello", ["c1"], submissionId)

    // Second call with same submissionId but ["c2"] (different selection)
    mockResolveValue = { data: customers.slice(1), error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: firstHash,
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const mismatchResult = await confirmBroadcastSelected("Hello", ["c2"], submissionId)
    expect(mismatchResult.payloadMismatch).toBe(true)
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
  })

  it("returns existing counts for a completed duplicate", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "allowed" },
    ]
    const submissionId = "ffffffff-ffff-ffff-ffff-ffffffffffff"

    mockResolveValue = { data: customers, error: null }
    await confirmBroadcastSelected("Hello", ["c1", "c2"], submissionId)

    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    const expectedHash = await computePayloadHash("Hello", ["c1", "c2"])
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: expectedHash,
        status: "completed",
        recipient_count: 2,
        sent_count: 2,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const dupResult = await confirmBroadcastSelected("Hello", ["c1", "c2"], submissionId)
    expect(dupResult.alreadySubmitted).toBe(true)
    expect(dupResult.sent).toBe(2)
    expect(dupResult.skipped).toBe(0)
  })

  it("surfaces non-23505 database errors", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    // Simulate a unique violation on a different constraint (not the company_key index)
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "some_other_constraint"',
    }

    const result = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa101")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    // Provider must NOT be called when an unexpected DB error occurs
    expect(mockSendMessages).not.toHaveBeenCalled()
  })

  it("surfaces non-unique database errors", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    // Simulate a connection error
    mockInsertError = { code: "PGRST301", message: "Database connection error", details: "" }

    const result = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa102")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockSendMessages).not.toHaveBeenCalled()
  })

  it("marks submission uncertain on unexpected error after claim", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    // Make sendMessages throw (simulates rare provider system error)
    mockSendMessages.mockRejectedValueOnce(new Error("Provider connection lost"))

    const result = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa103")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()

    // The update should have been called to mark the submission uncertain
    expect(mockChain.update).toHaveBeenCalled()
    expect(mockChain.update.mock.calls[0][0].status).toBe("uncertain")
    expect(mockChain.update.mock.calls[0][0].last_error_code).toBe("unexpected_error")
  })

  it("marks submission uncertain when message history insert fails", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    // The first insert (broadcast_submissions claim) succeeds, but the second (messages) fails.
    // We use call count tracking: the first insert returns success, subsequent ones fail.
    let insertCallCount = 0
    mockChain.insert.mockImplementation(() => {
      insertCallCount++
      if (insertCallCount >= 2) {
        return Promise.resolve({ error: { code: "PGRST116", message: "insert error" } })
      }
      return Promise.resolve({ error: null })
    })

    const result = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa104")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Failed to save message history")

    // Verify submission was marked uncertain
    expect(mockChain.update).toHaveBeenCalled()
    expect(mockChain.update.mock.calls[0][0].status).toBe("uncertain")
    expect(mockChain.update.mock.calls[0][0].last_error_code).toBe("history_insert_failed")
  })

  it("stores truthful counts in completed submission", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
      { id: "c2", customer_name: "Bob", mobile_no: "+9****22", policy_no: "P2", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }
    // Make first recipient succeed, second fail
    mockSendMessages.mockResolvedValueOnce([
      { success: true, providerMessageId: "mock-sid-1" },
      { success: false, error: "Provider rejected" },
    ])

    const result = await confirmBroadcastSelected("Hello", ["c1", "c2"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa105")
    expect(result.success).toBe(true)
    expect(result.sent).toBe(1)

    // Verify submission update includes truthful counts
    const updateCall = mockChain.update.mock.calls[0]
    expect(updateCall[0].status).toBe("completed")
    expect(updateCall[0].sent_count).toBe(1)
    expect(updateCall[0].failed_count).toBe(1)
  })

  it("does not create fake sentinel rows in message history", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa106")
    expect(result.success).toBe(true)
    expect(result.sent).toBe(1)

    // Find the messages insert call (not the broadcast_submissions claim insert)
    const insertCalls = mockChain.insert.mock.calls
    const messagesCall = insertCalls.find((args: any[]) => Array.isArray(args[0]))
    expect(messagesCall).toBeDefined()
    const messageRows = messagesCall![0]
    expect(messageRows).toHaveLength(1)
    expect(messageRows[0].customer_record_id).toBe("c1")
    expect(messageRows[0].message_body).toBe("Hello")
    expect(messageRows[0].status).toBe("sent")
    // No row should have an idempotency_key for broadcast
    expect(messageRows[0].idempotency_key).toBeUndefined()
  })

  it("does not make a claim when no eligible recipients exist", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "invalid_number" },
    ]
    mockResolveValue = { data: customers, error: null }

    // Clear insert mock to verify no claim call
    mockChain.insert.mockClear()
    const result = await confirmBroadcastSelected("Hello", ["c1"], "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa107")
    expect(result.error).toContain("No eligible recipients")
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  it("returns processing status when existing submission is still processing", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    // Claim the submission (no provider call — simulate in-flight)
    mockResolveValue = { data: customers, error: null }

    // Duplicate attempt while processing
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "processing",
        recipient_count: 1,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const result = await confirmBroadcastSelected("Hello", ["c1"], submissionId)
    expect(result.alreadySubmitted).toBe(true)
    expect(result.submissionStatus).toBe("processing")
    expect(result.success).toBe(false)
    expect(result.error).toContain("already being processed")
    expect(mockSendMessages).not.toHaveBeenCalled()
  })

  it("returns uncertain status when existing submission is uncertain", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "uncertain",
        recipient_count: 1,
        sent_count: 0,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const result = await confirmBroadcastSelected("Hello", ["c1"], submissionId)
    expect(result.alreadySubmitted).toBe(true)
    expect(result.submissionStatus).toBe("uncertain")
    expect(result.success).toBe(false)
    expect(result.error).toContain("uncertain")
    expect(mockSendMessages).not.toHaveBeenCalled()
  })

  it("genuine concurrent requests — both in flight, provider called once", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    // Track claimed submission keys so the mock behaves like the real DB unique constraint
    const claimedKeys = new Set<string>()
    mockChain.insert.mockImplementation((data: any) => {
      const key = data?.submission_key
      if (key && claimedKeys.has(key)) {
        return Promise.resolve({
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
          },
        })
      }
      if (key) claimedKeys.add(key)
      return Promise.resolve({ error: null })
    })

    // Hold sendMessages so the first call blocks mid-flight
    let sendResolve: (v: any) => void
    const sendDeferred = new Promise<any>((resolve) => { sendResolve = resolve })
    mockSendMessages.mockImplementationOnce(() => sendDeferred)

    // Set up duplicate lookup response
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    mockResolveValue = { data: customers, error: null }

    // Start first call — performs claim then blocks at sendMessages
    const firstPromise = confirmBroadcastSelected("Hello", ["c1"], submissionId)
    // Start second call while first is still in-flight (before sendMessages resolves)
    const secondPromise = confirmBroadcastSelected("Hello", ["c1"], submissionId)

    // Release the first call — only now can sendMessages proceed
    sendResolve!([{ success: true, providerMessageId: "mock-sid" }])

    const [firstResult, secondResult] = await Promise.all([firstPromise, secondPromise])

    expect(firstResult.success).toBe(true)
    expect(secondResult.alreadySubmitted).toBe(true)
    expect(secondResult.submissionStatus).toBe("completed")
    // Provider must be called exactly once (by the winning request only)
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
    // Duplicate must not create message-history rows
    const insertCalls = mockChain.insert.mock.calls
    const messagesCalls = insertCalls.filter((args: any[]) => Array.isArray(args[0]))
    expect(messagesCalls).toHaveLength(1)
  })

  it("prevents duplicate concurrent submission from creating history rows", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    // Same claimed-keys pattern for atomic insert behavior
    const claimedKeys = new Set<string>()
    mockChain.insert.mockImplementation((data: any) => {
      const key = data?.submission_key
      if (key && claimedKeys.has(key)) {
        return Promise.resolve({
          error: {
            code: "23505",
            message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
          },
        })
      }
      if (key) claimedKeys.add(key)
      return Promise.resolve({ error: null })
    })

    let sendResolve: (v: any) => void
    const sendDeferred = new Promise<any>((resolve) => { sendResolve = resolve })
    mockSendMessages.mockImplementationOnce(() => sendDeferred)

    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    mockResolveValue = { data: customers, error: null }

    const firstPromise = confirmBroadcastSelected("Hello", ["c1"], submissionId)
    const secondPromise = confirmBroadcastSelected("Hello", ["c1"], submissionId)
    sendResolve!([{ success: true, providerMessageId: "mock-sid" }])

    await Promise.all([firstPromise, secondPromise])

    // Verify only one messages insert call (find calls with array argument)
    const insertCalls = mockChain.insert.mock.calls
    const messagesCalls = insertCalls.filter((args: any[]) => Array.isArray(args[0]))
    expect(messagesCalls).toHaveLength(1)
    // The winning request's messages must have exactly one recipient row
    expect(messagesCalls[0][0]).toHaveLength(1)
    // The second request did not call sendMessages
    expect(mockSendMessages).toHaveBeenCalledTimes(1)
  })

  // ── Cross-company isolation tests ──

  it("scopes claim insert by authenticated company_id", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    await confirmBroadcastSelected("Hello", ["c1"], TEST_SUB_ID)

    // Find the broadcast_submissions claim insert (table insert, not messages array insert)
    const insertCalls = mockChain.insert.mock.calls
    const claimCalls = insertCalls.filter((args: any[]) => args[0]?.company_id !== undefined)
    expect(claimCalls).toHaveLength(1)
    // company_id must equal the authenticated profile's company_id
    expect(claimCalls[0][0].company_id).toBe("test-company-id")
    // The server must never accept a client-supplied company_id
    expect(claimCalls[0][0].company_id).not.toBe("other-company-id")
  })

  it("scopes duplicate lookup by authenticated company_id", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const submissionId = "ffffffff-ffff-ffff-ffff-ffffffffffff"

    mockResolveValue = { data: customers, error: null }
    mockInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "idx_broadcast_submissions_company_key"',
    }
    mockSingleReturn = {
      data: {
        id: "sub-1",
        company_id: "test-company-id",
        submission_key: submissionId,
        payload_hash: await computePayloadHash("Hello", ["c1"]),
        status: "completed",
        recipient_count: 1,
        sent_count: 1,
        failed_count: 0,
        skipped_count: 0,
      },
      error: null,
    }

    const result = await confirmBroadcastSelected("Hello", ["c1"], submissionId)
    expect(result.alreadySubmitted).toBe(true)

    // The duplicate lookup must be scoped by the authenticated company_id
    const eqCalls = mockChain.eq.mock.calls
    const companyEqCalls = eqCalls.filter((args: any[]) => args[0] === "company_id")
    // At least one .eq("company_id", ...) call came from the duplicate lookup
    expect(companyEqCalls.length).toBeGreaterThanOrEqual(1)
    // All company_id scoping uses the authenticated profile's company_id
    for (const call of companyEqCalls) {
      expect(call[1]).toBe("test-company-id")
    }
  })

  it("allows same submission_key under different companies", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    const sharedKey = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    // Company A claims key
    mockGetProfile.mockReturnValueOnce({
      id: "user-a", company_id: "company-a", role: "company_admin", is_active: true,
      companies: { name: "Company A" },
    })
    mockResolveValue = { data: customers, error: null }
    const resultA = await confirmBroadcastSelected("Hello", ["c1"], sharedKey)
    expect(resultA.success).toBe(true)

    // Reset insert mock so we can verify Company B's claim is a separate insert call
    mockChain.insert.mockClear()
    mockSendMessages.mockClear()

    // Company B claims the same key — must succeed because unique key is (company_id, submission_key)
    mockGetProfile.mockReturnValueOnce({
      id: "user-b", company_id: "company-b", role: "company_admin", is_active: true,
      companies: { name: "Company B" },
    })
    mockResolveValue = { data: customers, error: null }
    const resultB = await confirmBroadcastSelected("Hello", ["c1"], sharedKey)
    expect(resultB.success).toBe(true)

    // Both companies sent independently
    expect(mockSendMessages).toHaveBeenCalledTimes(1)

    // Verify Company B's claim was a fresh insert (not a duplicate lookup)
    const insertCalls = mockChain.insert.mock.calls
    const claimCalls = insertCalls.filter((args: any[]) => args[0]?.company_id !== undefined)
    expect(claimCalls).toHaveLength(1)
    expect(claimCalls[0][0].company_id).toBe("company-b")
  })

  it("scopes all update paths by authenticated company_id", async () => {
    const customers = [
      { id: "c1", customer_name: "Alice", mobile_no: "+9****11", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    await confirmBroadcastSelected("Hello", ["c1"], TEST_SUB_ID)

    // Verify the completion update was scoped by company_id
    const updateEqCalls = mockUpdateChain.eq.mock.calls
    const companyEqCalls = updateEqCalls.filter((args: any[]) => args[0] === "company_id")
    expect(companyEqCalls.length).toBeGreaterThanOrEqual(1)
    for (const call of companyEqCalls) {
      expect(call[1]).toBe("test-company-id")
    }
  })

  it("rejects non-company_admin role before any company-scoped operation", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-staff", company_id: "test-company-id", role: "staff", is_active: true,
      companies: { name: "Test Company" },
    })

    const result = await confirmBroadcastSelected("Hello", ["c1"], TEST_SUB_ID)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")

    // No DB insert should have occurred
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated user before any company-scoped operation", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user", company_id: null, role: "staff", is_active: true,
      companies: null,
    })

    const result = await confirmBroadcastSelected("Hello", ["c1"], TEST_SUB_ID)
    expect(result.success).toBe(false)
    expect(result.error).toContain("No company assigned")

    // No DB insert should have occurred
    expect(mockChain.insert).not.toHaveBeenCalled()
  })

  it("rejects invalid submissionId format", async () => {
    const result = await confirmBroadcastSelected("Hello", ["c1"], "not-a-uuid")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid submission identifier format")
    expect(mockSendMessages).not.toHaveBeenCalled()
  })

  it("rejects submissionId exceeding max length", async () => {
    const longId = "a".repeat(65)
    const result = await confirmBroadcastSelected("Hello", ["c1"], longId)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid submission identifier")
    expect(mockSendMessages).not.toHaveBeenCalled()
  })

  it("rejects missing submissionId", async () => {
    const result = await confirmBroadcastSelected("Hello", ["c1"], "")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid submission identifier")
    expect(mockSendMessages).not.toHaveBeenCalled()
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

  it("rejects staff without broadcast:create grant", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      is_active: true,
      companies: { name: "Test Company" },
    })

    const result = await getBroadcastRecipientsPaginated("", 1)

    expect(result.recipients).toHaveLength(0)
    expect(result.hasMore).toBe(false)
  })

  it("allows staff with broadcast:create grant to search recipients", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      is_active: true,
      companies: { name: "Test Company" },
    })
    const customers = [
      { id: "c1", customer_name: "Test Customer", mobile_no: "+9****00", policy_no: "P1", communication_status: "allowed" },
    ]
    mockResolveValue = { data: customers, error: null }

    const result = await getBroadcastRecipientsPaginated("", 1)

    expect(result.recipients).toHaveLength(1)
    expect(result.recipients[0].customer_name).toBe("Test Customer")
  })
})

describe("computePayloadHash", () => {
  it("returns consistent hash for same body and sorted IDs", async () => {
    const h1 = await computePayloadHash("Hello", ["c3", "c1", "c2"])
    const h2 = await computePayloadHash("Hello", ["c1", "c2", "c3"])
    expect(h1).toBe(h2)
  })

  it("returns different hash for different body", async () => {
    const h1 = await computePayloadHash("Hello", ["c1"])
    const h2 = await computePayloadHash("Goodbye", ["c1"])
    expect(h1).not.toBe(h2)
  })

  it("returns different hash for different recipient set", async () => {
    const h1 = await computePayloadHash("Hello", ["c1"])
    const h2 = await computePayloadHash("Hello", ["c2"])
    expect(h1).not.toBe(h2)
  })

  it("returns different hash when same IDs but different order", async () => {
    const h1 = await computePayloadHash("Hello", ["c1", "c2"])
    const h2 = await computePayloadHash("Hello", ["c2", "c1"])
    // Both are sorted server-side, so should match
    expect(h1).toBe(h2)
  })

  it("trims body consistently", async () => {
    const h1 = await computePayloadHash("  Hello  ", ["c1"])
    const h2 = await computePayloadHash("Hello", ["c1"])
    expect(h1).toBe(h2)
  })
})
