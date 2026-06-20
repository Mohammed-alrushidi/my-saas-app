import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockChain = { from: vi.fn() }

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
})

import { inviteStaff, deactivateStaff, activateStaff } from "@/app/dashboard/staff/actions"

describe("inviteStaff", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await inviteStaff("test@example.com", "Test User")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})

describe("deactivateStaff", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await deactivateStaff("target-user-id")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})

describe("activateStaff", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await activateStaff("target-user-id")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})
