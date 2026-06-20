import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

const mockInsertChain = {
  select: vi.fn(() => ({
    single: vi.fn(() =>
      Promise.resolve({ data: { id: "new-company-id", name: "Test Co" }, error: null }),
    ),
  })),
}

const mockSupabaseFrom = vi.fn((table: string) => {
  if (table === "companies") return { insert: vi.fn(() => mockInsertChain) }
  return { update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockSupabaseFrom })),
}))

const mockAdminResetPassword = vi.fn(() => Promise.resolve({ error: null }))

const mockAdminClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
  })),
  auth: {
    admin: {
      createUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: "new-admin-id" } }, error: null }),
      ),
    },
    resetPasswordForEmail: mockAdminResetPassword,
  },
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
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

  it("sends password reset email with /update-password redirect", async () => {
    const fd = new FormData()
    fd.append("name", "Test Co")
    fd.append("domain", "test-co")
    fd.append("admin_email", "admin@test.com")
    fd.append("admin_name", "Admin")

    try {
      await createCompany(fd)
    } catch {
      // Expected — mocks eventually redirect
    }

    expect(mockAdminResetPassword).toHaveBeenCalledWith(
      "admin@test.com",
      { redirectTo: expect.stringContaining("/update-password") },
    )
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
