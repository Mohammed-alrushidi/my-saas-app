import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockChain = { from: vi.fn() }

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

let mockAdminAuthCreateUser: any = { data: { user: { id: "new-staff-id" } }, error: null }
let mockAdminAuthDeleteUser: any = { data: null, error: null }
let mockAdminResetPassword: any = { error: null }
let mockAdminUpdateResult: any = { error: null }
let mockAdminSelectResult: any = { data: null, error: null }

// Build a thenable chain for the admin supabase client
function buildAdminChain() {
  const updateFn = vi.fn(function (this: any, _vals: any) { return this })
  const chain: any = {
    select: vi.fn(() => chain),
    update: updateFn,
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(mockAdminSelectResult)),
  }
  // Make the chain thenable so await resolves to mockAdminUpdateResult
  Object.defineProperty(chain, "then", {
    value: function (resolve: any) {
      return Promise.resolve(mockAdminUpdateResult).then(resolve)
    },
    writable: true,
    configurable: true,
  })
  chain._updateFn = updateFn
  return chain
}

const adminChain = buildAdminChain()

const mockAdminClient = {
  from: vi.fn(() => adminChain),
  auth: {
    admin: {
      createUser: vi.fn(() => Promise.resolve(mockAdminAuthCreateUser)),
      deleteUser: vi.fn(() => Promise.resolve(mockAdminAuthDeleteUser)),
      listUsers: vi.fn(() => Promise.resolve({ data: { users: [] }, error: null })),
    },
    resetPasswordForEmail: vi.fn(() => Promise.resolve(mockAdminResetPassword)),
  },
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
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
  mockAdminAuthCreateUser = { data: { user: { id: "new-staff-id" } }, error: null }
  mockAdminAuthDeleteUser = { data: null, error: null }
  mockAdminResetPassword = { error: null }
  mockAdminUpdateResult = { error: null }
  mockAdminSelectResult = { data: null, error: null }
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

  it("creates auth user, updates profile via admin client, sends reset email", async () => {
    const result = await inviteStaff("staff@example.com", "Jane Staff")

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()

    expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith({
      email: "staff@example.com",
      password: expect.any(String),
      email_confirm: true,
    })

    expect(mockAdminClient.from).toHaveBeenCalledWith("profiles")

    expect(mockAdminClient.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "staff@example.com",
      { redirectTo: expect.stringContaining("/update-password") },
    )
  })

  it("updates profile with admin client (bypasses RLS)", async () => {
    await inviteStaff("staff@example.com", "Jane Staff")

    expect(mockAdminClient.from).toHaveBeenCalledWith("profiles")
    expect(adminChain._updateFn).toHaveBeenCalledWith({
      company_id: "test-company-id",
      full_name: "Jane Staff",
      is_active: true,
    })
  })

  it("cleans up auth user and returns error when profile update fails", async () => {
    mockAdminUpdateResult = { error: new Error("Profile update failed") }

    const result = await inviteStaff("staff@example.com", "Jane Staff")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Profile update failed")

    expect(mockAdminClient.auth.admin.deleteUser).toHaveBeenCalledWith("new-staff-id")
  })

  it("returns error when reset password email fails", async () => {
    mockAdminResetPassword = { error: new Error("Email send failed") }

    const result = await inviteStaff("staff@example.com", "Jane Staff")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Email send failed")
  })

  it("rejects missing email", async () => {
    const result = await inviteStaff("", "Test User")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Email is required")
  })

  it("rejects missing name", async () => {
    const result = await inviteStaff("test@example.com", "")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Full name is required")
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
