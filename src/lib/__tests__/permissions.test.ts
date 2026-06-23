import { describe, it, expect, vi, beforeEach } from "vitest"

let mockMaybeSingle: any = { data: null }

const mockChain: any = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingle)),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

import { can, COMPANY_PERMISSIONS } from "@/lib/supabase/permissions"

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
