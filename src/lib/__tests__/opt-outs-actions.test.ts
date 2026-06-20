import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockChain = { from: vi.fn() }

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
  getOptOuts: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { addOptOut, removeOptOut } from "@/app/dashboard/opt-outs/actions"

describe("addOptOut", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await addOptOut("+96891111111")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})

describe("removeOptOut", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await removeOptOut("some-id")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})
