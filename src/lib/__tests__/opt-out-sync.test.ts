import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const getProfile = vi.fn()
const responses: { data?: unknown; error?: unknown }[] = []
const calls: { table: string; method: string; args: unknown[] }[] = []

function builder(table: string) {
  const chain = {
    select: vi.fn((...args: unknown[]) => { calls.push({ table, method: "select", args }); return chain }),
    eq: vi.fn((...args: unknown[]) => { calls.push({ table, method: "eq", args }); return chain }),
    insert: vi.fn((...args: unknown[]) => { calls.push({ table, method: "insert", args }); return chain }),
    update: vi.fn((...args: unknown[]) => { calls.push({ table, method: "update", args }); return chain }),
    maybeSingle: vi.fn(async () => responses.shift() ?? { data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(responses.shift() ?? { data: null, error: null }).then(resolve),
  }
  return chain
}

const db = { from: vi.fn((table: string) => builder(table)) }

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }))
vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
  getOptOuts: vi.fn(),
}))

beforeEach(() => {
  responses.length = 0
  calls.length = 0
  vi.clearAllMocks()
  getProfile.mockResolvedValue({ id: "admin", company_id: "company-a", role: "company_admin" })
})

describe("manual opt-out synchronization", () => {
  it("preserves canonical +968 form for the opt-out and customer update", async () => {
    responses.push(
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    )
    const { addOptOut } = await import("@/app/dashboard/opt-outs/actions")
    expect((await addOptOut(" 968 91111111 ")).success).toBe(true)
    expect(calls).toContainEqual({
      table: "opt_outs",
      method: "insert",
      args: [{ company_id: "company-a", mobile_no: "+96891111111", source: "company_added" }],
    })
    expect(calls).toContainEqual({ table: "customer_records", method: "eq", args: ["mobile_no", "+96891111111"] })
  })
})
