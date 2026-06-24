import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockMaybeSingle: any = { data: null }

const mockChain: any = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  order: vi.fn(() => Promise.resolve({ data: [] })),
  insert: vi.fn(() => Promise.resolve({ error: null })),
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
import { createPermissionRequest, getMyPermissionRequests } from "@/app/dashboard/permissions/actions"
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
