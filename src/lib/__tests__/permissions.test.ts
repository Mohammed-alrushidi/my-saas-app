import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockMaybeSingle: any = { data: null }

const mockChain: any = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  order: vi.fn(() => Promise.resolve({ data: [] })),
  insert: vi.fn(() => Promise.resolve({ error: null })),
  update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
  maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingle)),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

const mockGetProfile = vi.fn(() => ({
  id: "staff-id",
  company_id: "company-a",
  role: "staff",
  is_active: true,
}))

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
}))

import { can, COMPANY_PERMISSIONS } from "@/lib/supabase/permissions"
import {
  createPermissionRequest,
  getMyPermissionRequests,
  getCompanyPermissionRequests,
  approvePermissionRequest,
  rejectPermissionRequest,
} from "@/app/dashboard/permissions/actions"
import { revalidatePath } from "next/cache"

const companyAdmin = {
  id: "admin-id",
  company_id: "company-a",
  role: "company_admin",
  is_active: true,
}

const staff = {
  id: "staff-id",
  company_id: "company-a",
  role: "staff",
  is_active: true,
}

const superAdmin = {
  id: "super-id",
  company_id: null,
  role: "super_admin",
  is_active: true,
}

describe("COMPANY_PERMISSIONS", () => {
  it("defines the correct set of permissions", () => {
    expect(COMPANY_PERMISSIONS).toEqual([
      "templates:edit",
      "reminder_settings:edit",
      "broadcast:create",
    ])
  })
})

describe("can() — null and edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
  })

  it("returns false when profile is null", async () => {
    const result = await can(null, "templates:edit")
    expect(result).toBe(false)
  })

  it("returns false for inactive profile", async () => {
    const result = await can(
      { ...staff, is_active: false },
      "templates:edit",
    )
    expect(result).toBe(false)
  })

  it("returns false for unknown permission string", async () => {
    const result = await can(companyAdmin, "broadcast:send")
    expect(result).toBe(false)
  })
})

describe("can() — company_admin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
  })

  it("returns true for any known permission", async () => {
    for (const perm of COMPANY_PERMISSIONS) {
      const result = await can(companyAdmin, perm)
      expect(result).toBe(true)
    }
  })

  it("returns false for unknown permission", async () => {
    const result = await can(companyAdmin, "some_random_string")
    expect(result).toBe(false)
  })
})

describe("can() — staff", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
  })

  it("returns false without any active grant", async () => {
    const result = await can(staff, "templates:edit")
    expect(result).toBe(false)
  })

  it("returns true with matching active grant", async () => {
    mockMaybeSingle = { data: { id: "grant-1" } }

    const result = await can(staff, "templates:edit")
    expect(result).toBe(true)
  })

  it("returns false for revoked grant (maybeSingle returns null)", async () => {
    mockMaybeSingle = { data: null }

    const result = await can(staff, "templates:edit")
    expect(result).toBe(false)
  })

  it("queries with the requested permission (not a different one)", async () => {
    mockMaybeSingle = { data: { id: "grant-2" } }

    await can(staff, "templates:edit")
    expect(mockChain.eq).toHaveBeenCalledWith("permission", "templates:edit")
  })

  it("returns false for staff with no company_id", async () => {
    const result = await can(
      { ...staff, company_id: null },
      "templates:edit",
    )
    expect(result).toBe(false)
  })

  it("queries the staff_permission_grants table", async () => {
    mockMaybeSingle = { data: { id: "grant-3" } }
    await can(staff, "reminder_settings:edit")

    expect(mockChain.from).toHaveBeenCalledWith("staff_permission_grants")
    expect(mockChain.eq).toHaveBeenCalledWith("company_id", "company-a")
    expect(mockChain.eq).toHaveBeenCalledWith("staff_id", "staff-id")
    expect(mockChain.eq).toHaveBeenCalledWith("permission", "reminder_settings:edit")
    expect(mockChain.eq).toHaveBeenCalledWith("is_active", true)
  })
})

describe("can() — super_admin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
  })

  it("returns false for any known company permission", async () => {
    for (const perm of COMPANY_PERMISSIONS) {
      const result = await can(superAdmin, perm)
      expect(result).toBe(false)
    }
  })

  it("returns false for unknown permission", async () => {
    const result = await can(superAdmin, "broadcast:send")
    expect(result).toBe(false)
  })
})

describe("createPermissionRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
    mockChain.insert = vi.fn(() => Promise.resolve({ error: null }))
  })

  it("rejects unauthenticated user", async () => {
    mockGetProfile.mockReturnValueOnce(null)

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Not authenticated")
  })

  it("rejects staff with no company_id", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "staff-id", company_id: null, role: "staff", is_active: true })

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("No company assigned")
  })

  it("rejects inactive staff", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "staff-id", company_id: "company-a", role: "staff", is_active: false })

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("inactive")
  })

  it("rejects company_admin", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Only staff")
  })

  it("rejects super_admin", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "super-id", company_id: "company-a", role: "super_admin", is_active: true })

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Only staff")
  })

  it("rejects unknown permission", async () => {
    const result = await createPermissionRequest("broadcast:send", "I need to send broadcasts")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid permission")
  })

  it("rejects reason too short", async () => {
    const result = await createPermissionRequest("templates:edit", "short")
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/at least 10/)
  })

  it("rejects reason too long", async () => {
    const result = await createPermissionRequest("templates:edit", "x".repeat(501))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/at most 500/)
  })

  it("rejects duplicate pending request", async () => {
    mockMaybeSingle = { data: { id: "existing-req" } }

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("already have a pending request")
  })

  it("handles database unique constraint violation gracefully", async () => {
    mockChain.insert = vi.fn(() => Promise.resolve({ error: { code: "23505", message: "duplicate key" } }))

    const result = await createPermissionRequest("templates:edit", "I need to update templates")
    expect(result.success).toBe(false)
    expect(result.error).toContain("already have a pending request")
  })

  it("inserts and returns success", async () => {
    const result = await createPermissionRequest("templates:edit", "I need to update message templates")
    expect(result.success).toBe(true)
    expect(mockChain.from).toHaveBeenCalledWith("permission_requests")
    expect(mockChain.insert).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/permissions")
  })
})

describe("getMyPermissionRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty array when unauthenticated", async () => {
    mockGetProfile.mockReturnValueOnce(null)

    const result = await getMyPermissionRequests()
    expect(result).toEqual([])
  })

  it("returns the staff's own requests sorted by created_at desc", async () => {
    const mockData = [
      { id: "1", permission: "templates:edit", status: "pending", created_at: "2026-06-24T10:00:00Z" },
      { id: "2", permission: "broadcast:create", status: "approved", created_at: "2026-06-23T10:00:00Z" },
    ]
    mockChain.order = vi.fn(() => Promise.resolve({ data: mockData }))

    const result = await getMyPermissionRequests()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("1")
    expect(mockChain.from).toHaveBeenCalledWith("permission_requests")
    expect(mockChain.eq).toHaveBeenCalledWith("staff_id", "staff-id")
    expect(mockChain.order).toHaveBeenCalledWith("created_at", { ascending: false })
  })
})

describe("getCompanyPermissionRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChain.order = vi.fn(() => Promise.resolve({ data: [] }))
  })

  it("returns null for unauthenticated user", async () => {
    mockGetProfile.mockReturnValueOnce(null)
    const result = await getCompanyPermissionRequests()
    expect(result).toBeNull()
  })

  it("returns null for staff role", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "staff-id", company_id: "company-a", role: "staff", is_active: true })
    const result = await getCompanyPermissionRequests()
    expect(result).toBeNull()
  })

  it("returns null for inactive admin", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: false })
    const result = await getCompanyPermissionRequests()
    expect(result).toBeNull()
  })

  it("returns null for admin with no company", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: null, role: "company_admin", is_active: true })
    const result = await getCompanyPermissionRequests()
    expect(result).toBeNull()
  })

  it("splits requests into pending and reviewed arrays with staff names", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    const mockData = [
      { id: "1", permission: "templates:edit", status: "pending", reason: "Need to edit", staff_id: "staff-1", company_id: "company-a", reviewed_by: null, reviewed_at: null, review_note: null, created_at: "2026-06-24T10:00:00Z", staff: { full_name: "Staff One" } },
      { id: "2", permission: "broadcast:create", status: "approved", reason: "Need to broadcast", staff_id: "staff-2", company_id: "company-a", reviewed_by: "admin-id", reviewed_at: "2026-06-23T10:00:00Z", review_note: "Looks good", created_at: "2026-06-22T10:00:00Z", staff: { full_name: "Staff Two" } },
    ]
    mockChain.order = vi.fn(() => Promise.resolve({ data: mockData }))

    const result = await getCompanyPermissionRequests()
    expect(result).not.toBeNull()
    expect(result!.pending).toHaveLength(1)
    expect(result!.pending[0].id).toBe("1")
    expect(result!.pending[0].staff_name).toBe("Staff One")
    expect(result!.reviewed).toHaveLength(1)
    expect(result!.reviewed[0].id).toBe("2")
    expect(result!.reviewed[0].staff_name).toBe("Staff Two")
    expect(result!.reviewed[0].review_note).toBe("Looks good")
  })
})

describe("approvePermissionRequest", () => {
  const pendingRequest = {
    id: "req-1",
    company_id: "company-a",
    staff_id: "staff-id",
    permission: "templates:edit",
    status: "pending",
    reason: "I need to edit templates",
    staff: { full_name: "Staff User", company_id: "company-a", role: "staff", is_active: true },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
    mockChain.maybeSingle = vi.fn(() => Promise.resolve(mockMaybeSingle))
    mockChain.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockChain.insert = vi.fn(() => Promise.resolve({ error: null }))
  })

  it("rejects non-admin", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "staff-id", company_id: "company-a", role: "staff", is_active: true })
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Only company admins")
  })

  it("rejects cross-company request", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { ...pendingRequest, company_id: "company-b" } }))
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("does not belong to your company")
  })

  it("rejects non-pending request", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { ...pendingRequest, status: "approved" } }))
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("no longer pending")
  })

  it("rejects for inactive staff", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    const inactiveStaff = { full_name: "Staff User", company_id: "company-a", role: "staff", is_active: false }
    mockChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { ...pendingRequest, staff: inactiveStaff } }))
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("inactive staff member")
  })

  it("rejects if active grant already exists", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: pendingRequest })
      .mockResolvedValueOnce({ data: { id: "grant-1" } })
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("already has this permission")
  })

  it("handles duplicate grant on insert gracefully", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: pendingRequest })
      .mockResolvedValueOnce({ data: null })
    mockChain.insert = vi.fn(() => Promise.resolve({ error: { code: "23505", message: "duplicate key" } }))
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("already has this permission")
  })

  it("rejects when update fails after request load", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: pendingRequest })
      .mockResolvedValueOnce({ data: null })
    mockChain.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: { message: "DB error" } })) }))
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("DB error")
  })

  it("rejects when insert fails after request update", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: pendingRequest })
      .mockResolvedValueOnce({ data: null })
    mockChain.insert = vi.fn(() => Promise.resolve({ error: { message: "Insert failed" } }))
    const result = await approvePermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Insert failed")
  })

  it("approves successfully and creates grant", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: pendingRequest })
      .mockResolvedValueOnce({ data: null })
    const result = await approvePermissionRequest("req-1", "Looks good")
    expect(result.success).toBe(true)
    expect(mockChain.from).toHaveBeenCalledWith("staff_permission_grants")
    expect(mockChain.insert).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/permissions")
  })
})

describe("rejectPermissionRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle = { data: null }
    mockChain.maybeSingle = vi.fn(() => Promise.resolve(mockMaybeSingle))
    mockChain.update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    mockChain.insert = vi.fn(() => Promise.resolve({ error: null }))
  })

  it("rejects non-admin", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "staff-id", company_id: "company-a", role: "staff", is_active: true })
    const result = await rejectPermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Only company admins")
  })

  it("rejects cross-company request", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: "req-1", company_id: "company-b", status: "pending" } }))
    const result = await rejectPermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("does not belong to your company")
  })

  it("rejects non-pending request", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: "req-1", company_id: "company-a", status: "approved" } }))
    const result = await rejectPermissionRequest("req-1")
    expect(result.success).toBe(false)
    expect(result.error).toContain("no longer pending")
  })

  it("rejects successfully with no grant created", async () => {
    mockGetProfile.mockReturnValueOnce({ id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true })
    mockChain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: "req-1", company_id: "company-a", status: "pending" } }))
    const result = await rejectPermissionRequest("req-1", "Not needed")
    expect(result.success).toBe(true)
    expect(mockChain.from).not.toHaveBeenCalledWith("staff_permission_grants")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/permissions")
  })
})
