import { describe, it, expect, vi, beforeEach } from "vitest"

import { revalidatePath } from "next/cache"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

function resultChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
  }
  Object.defineProperty(chain, "then", {
    value: function (resolve: (v: unknown) => unknown) {
      return Promise.resolve(result).then(resolve)
    },
    writable: true,
    configurable: true,
  })
  return chain
}

const mockChain = { from: vi.fn(() => resultChain({ data: null, error: null })) }

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

const mockGetProfile = vi.fn<() => {
  id: string
  company_id: string | null
  role: string
  is_active: boolean
  companies: { name: string } | null
}>(() => ({
  id: "test-user-id",
  company_id: "test-company-id",
  role: "company_admin",
  is_active: true,
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

import { inviteStaff, deactivateStaff, activateStaff, revokeStaffPermission, getCompanyStaffGrants } from "@/app/dashboard/staff/actions"

describe("inviteStaff", () => {
  it("rejects non-admin role", async () => {
      mockGetProfile.mockReturnValueOnce({
        id: "test-user-id",
        company_id: "test-company-id",
        role: "staff",
        is_active: true,
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
        is_active: true,
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
        is_active: true,
        companies: { name: "Test Company" },
      })

      const result = await activateStaff("target-user-id")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })
})

describe("revokeStaffPermission", () => {
  it("allows company_admin to revoke active grant in own company", async () => {
    const grantId = "grant-1"
    const grantResult = { data: { id: grantId, company_id: "test-company-id", is_active: true }, error: null }
    const updateResult = { data: null, error: null }

    mockChain.from
      .mockReturnValueOnce(resultChain(grantResult))
      .mockReturnValueOnce(resultChain(updateResult))

    const result = await revokeStaffPermission(grantId)

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/staff")
  })

  it("rejects non-admin role", async () => {
      mockGetProfile.mockReturnValueOnce({
        id: "staff-id",
        company_id: "test-company-id",
        role: "staff",
        is_active: true,
        companies: null,
      })

    const result = await revokeStaffPermission("grant-1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only admins")
  })

  it("rejects inactive admin", async () => {
      mockGetProfile.mockReturnValueOnce({
        id: "test-user-id",
        company_id: "test-company-id",
        role: "company_admin",
        is_active: false,
        companies: null,
      })

    const result = await revokeStaffPermission("grant-1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("not active")
  })

  it("rejects admin without company_id", async () => {
      mockGetProfile.mockReturnValueOnce({
        id: "test-user-id",
        company_id: null,
        role: "company_admin",
        is_active: true,
        companies: null,
      })

    const result = await revokeStaffPermission("grant-1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("No company assigned")
  })

  it("rejects cross-company grant (returns not found)", async () => {
    const grantResult = { data: { id: "grant-1", company_id: "other-company-id", is_active: true }, error: null }

    mockChain.from
      .mockReturnValueOnce(resultChain(grantResult))

    const result = await revokeStaffPermission("grant-1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Permission grant not found")
  })

  it("rejects already revoked grant", async () => {
    const grantResult = { data: { id: "grant-1", company_id: "test-company-id", is_active: false }, error: null }

    mockChain.from
      .mockReturnValueOnce(resultChain(grantResult))

    const result = await revokeStaffPermission("grant-1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Permission grant is already revoked")
  })

  it("rejects non-existent grant", async () => {
    const grantResult = { data: null, error: { message: "not found", code: "PGRST116" } }

    mockChain.from
      .mockReturnValueOnce(resultChain(grantResult))

    const result = await revokeStaffPermission("non-existent-id")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Permission grant not found")
  })

  it("sets is_active to false and records revoked_by and revoked_at", async () => {
    const grantId = "grant-1"
    const grantResult = { data: { id: grantId, company_id: "test-company-id", is_active: true }, error: null }
    let capturedUpdate: Record<string, unknown> | null = null
    let capturedEq: string | null = null

    const updateChain = resultChain({ data: null, error: null })
    const originalUpdate = updateChain.update as any
    updateChain.update = vi.fn((vals: Record<string, unknown>) => {
      capturedUpdate = vals
      return updateChain
    }) as any
    const originalEq = updateChain.eq as any
    updateChain.eq = vi.fn((_col: string, _val: string) => {
      capturedEq = _val
      return updateChain
    }) as any

    mockChain.from
      .mockReturnValueOnce(resultChain(grantResult))
      .mockReturnValueOnce(updateChain)

    const result = await revokeStaffPermission(grantId)

    expect(result.success).toBe(true)
    expect(capturedUpdate).not.toBeNull()
    expect(capturedUpdate!.is_active).toBe(false)
    expect(capturedUpdate!.revoked_by).toBe("test-user-id")
    expect(capturedUpdate!.revoked_at).toEqual(expect.any(String))
    expect(capturedEq).toBe(grantId)
  })
})

describe("getCompanyStaffGrants", () => {
  it("returns staff with active grants only", async () => {
    const staffData = {
      data: [
        { id: "staff-1", full_name: "Jane Staff", role: "staff", is_active: true },
        { id: "staff-2", full_name: "John Staff", role: "staff", is_active: false },
      ],
      error: null,
    }
    const grantsData = {
      data: [
        { id: "grant-1", staff_id: "staff-1", permission: "templates:edit", granted_at: "2025-01-15T00:00:00Z" },
        { id: "grant-2", staff_id: "staff-1", permission: "broadcast:create", granted_at: "2025-02-01T00:00:00Z" },
      ],
      error: null,
    }

    mockChain.from
      .mockReturnValueOnce(resultChain(staffData))
      .mockReturnValueOnce(resultChain(grantsData))

    const result = await getCompanyStaffGrants()

    expect(result).toHaveLength(2)

    expect(result[0].id).toBe("staff-1")
    expect(result[0].grants).toHaveLength(2)
    expect(result[0].grants[0].permission).toBe("templates:edit")
    expect(result[0].grants[1].permission).toBe("broadcast:create")

    expect(result[1].id).toBe("staff-2")
    expect(result[1].grants).toHaveLength(0)
  })
})
