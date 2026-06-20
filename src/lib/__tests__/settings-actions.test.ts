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
  getReminderSettings: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { saveSettings, resetSettings } from "@/app/dashboard/settings/actions"

describe("saveSettings", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await saveSettings([14, 30], true)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})

describe("resetSettings", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await resetSettings()

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})
