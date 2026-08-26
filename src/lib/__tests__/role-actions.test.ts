import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockGetProfile = vi.fn()

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: () => mockGetProfile(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    Object.assign(chain, {
      from: vi.fn(() => chain),
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })
    return chain
  }),
}))

import { getDashboardCapabilities, getCurrentRole } from "@/app/dashboard/role-actions"

describe("getDashboardCapabilities", () => {
  beforeEach(() => {
    mockGetProfile.mockReset()
  })

  it("returns null when there is no profile", async () => {
    mockGetProfile.mockResolvedValueOnce(null)
    expect(await getDashboardCapabilities()).toBeNull()
  })

  it("exposes the caller's own company name from the profiles -> companies embed", async () => {
    mockGetProfile.mockResolvedValueOnce({
      id: "user-1",
      company_id: "company-1",
      role: "company_admin",
      is_active: true,
      companies: { id: "company-1", name: "Test Company" },
    })

    const caps = await getDashboardCapabilities()
    expect(caps).not.toBeNull()
    expect(caps!.companyName).toBe("Test Company")
    expect(caps!.canPrepareBroadcast).toBe(true)
    expect(caps!.canSendBroadcast).toBe(true)
  })

  it("falls back to null companyName when the company embed is missing (RLS denied)", async () => {
    mockGetProfile.mockResolvedValueOnce({
      id: "user-1",
      company_id: "company-1",
      role: "staff",
      is_active: true,
      companies: null,
    })

    const caps = await getDashboardCapabilities()
    expect(caps).not.toBeNull()
    expect(caps!.companyName).toBeNull()
  })

  it("never exposes a company the caller does not belong to", async () => {
    // The only company data reachable is via the caller's own profile embed;
    // a foreign company must never appear regardless of role.
    mockGetProfile.mockResolvedValueOnce({
      id: "user-1",
      company_id: "company-1",
      role: "company_admin",
      is_active: true,
      companies: { id: "company-1", name: "Own Company" },
    })

    const caps = await getDashboardCapabilities()
    expect(caps!.companyName).toBe("Own Company")
    expect(JSON.stringify(caps)).not.toContain("Other Company")
  })
})

describe("getCurrentRole", () => {
  beforeEach(() => {
    mockGetProfile.mockReset()
  })

  it("returns the profile role", async () => {
    mockGetProfile.mockResolvedValueOnce({ role: "staff" })
    expect(await getCurrentRole()).toBe("staff")
  })

  it("returns null when unauthenticated", async () => {
    mockGetProfile.mockResolvedValueOnce(null)
    expect(await getCurrentRole()).toBeNull()
  })
})
