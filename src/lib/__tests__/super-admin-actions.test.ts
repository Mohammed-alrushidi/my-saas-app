import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}))

const mockGetProfile = vi.fn(() => ({
  id: "test-user-id",
  company_id: null,
  role: "super_admin",
}))

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockRedirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT") })
})

import { createCompany, toggleCompanyStatus } from "@/app/super-admin/companies/actions"

describe("createCompany", () => {
  it("rejects company_admin", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "admin-user-id",
      company_id: "test-company-id",
      role: "company_admin",
    })

    const fd = new FormData()
    fd.append("name", "Test Co")
    fd.append("domain", "test-co")
    fd.append("admin_email", "admin@test.com")
    fd.append("admin_name", "Admin")

    await expect(createCompany(fd)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("rejects staff", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "staff-user-id",
      company_id: "test-company-id",
      role: "staff",
    })

    const fd = new FormData()
    fd.append("name", "Test Co")
    fd.append("domain", "test-co")
    fd.append("admin_email", "admin@test.com")
    fd.append("admin_name", "Admin")

    await expect(createCompany(fd)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("rejects unauthenticated user", async () => {
    mockGetProfile.mockReturnValueOnce(null)

    const fd = new FormData()
    fd.append("name", "Test Co")
    fd.append("domain", "test-co")
    fd.append("admin_email", "admin@test.com")
    fd.append("admin_name", "Admin")

    await expect(createCompany(fd)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("allows super_admin to proceed", async () => {
    const fd = new FormData()
    fd.append("name", "Test Co")
    fd.append("domain", "test-co")
    fd.append("admin_email", "admin@test.com")
    fd.append("admin_name", "Admin")

    try {
      await createCompany(fd)
    } catch {
      // Expected — DB mocks are not wired for the full flow
    }

    expect(mockRedirect).not.toHaveBeenCalledWith("/dashboard")
    expect(mockRedirect).not.toHaveBeenCalledWith("/login")
  })
})

describe("toggleCompanyStatus", () => {
  it("rejects company_admin", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "admin-user-id",
      company_id: "test-company-id",
      role: "company_admin",
    })

    const fd = new FormData()
    fd.append("company_id", "some-company-id")
    fd.append("is_active", "false")

    await expect(toggleCompanyStatus(fd)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("rejects staff", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "staff-user-id",
      company_id: "test-company-id",
      role: "staff",
    })

    const fd = new FormData()
    fd.append("company_id", "some-company-id")
    fd.append("is_active", "false")

    await expect(toggleCompanyStatus(fd)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("rejects unauthenticated user", async () => {
    mockGetProfile.mockReturnValueOnce(null)

    const fd = new FormData()
    fd.append("company_id", "some-company-id")
    fd.append("is_active", "false")

    await expect(toggleCompanyStatus(fd)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("allows super_admin to proceed", async () => {
    const fd = new FormData()
    fd.append("company_id", "some-company-id")
    fd.append("is_active", "false")

    try {
      await toggleCompanyStatus(fd)
    } catch {
      // Expected — DB mocks are not wired for the full flow
    }

    expect(mockRedirect).not.toHaveBeenCalledWith("/dashboard")
    expect(mockRedirect).not.toHaveBeenCalledWith("/login")
  })
})
