import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockResolveValue: any = { data: null, error: null }

const mockChain: any = {
  from: vi.fn(() => mockChain),
  select: vi.fn(() => mockChain),
  eq: vi.fn(() => mockChain),
  order: vi.fn(() => Promise.resolve({ data: [] })),
  insert: vi.fn(() => Promise.resolve({ error: null })),
  update: vi.fn(() => {
    const p = Promise.resolve({ error: null })
    ;(p as any).eq = vi.fn(() => p)
    return p
  }),
  maybeSingle: vi.fn(() => Promise.resolve(mockResolveValue)),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

const companyAdmin = { id: "admin-id", company_id: "company-a", role: "company_admin", is_active: true }
const staffProfile = { id: "staff-id", company_id: "company-a", role: "staff", is_active: true }
const superAdmin = { id: "super-id", company_id: null, role: "super_admin", is_active: true }

const mockGetProfile = vi.fn(() => companyAdmin)

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
  getCompanyTemplates: vi.fn(),
}))

import { saveTemplate, resetTemplate } from "@/app/dashboard/templates/actions"
import { revalidatePath } from "next/cache"

describe("saveTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveValue = { data: null, error: null }
  })

  it("allows company_admin to save template", async () => {
    const result = await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(result.success).toBe(true)
  })

  it("allows staff with templates:edit grant to save template", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)
    mockResolveValue = { data: { id: "grant-1" }, error: null }

    const result = await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(result.success).toBe(true)
  })

  it("rejects staff without templates:edit grant", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)

    const result = await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(result.success).toBe(false)
    expect(result.error).toContain("don't have permission")
  })

  it("rejects staff with revoked grant", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)
    mockResolveValue = { data: null, error: null }

    const result = await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(result.success).toBe(false)
    expect(result.error).toContain("don't have permission")
  })

  it("rejects super_admin", async () => {
    mockGetProfile.mockReturnValueOnce(superAdmin)

    const result = await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(result.success).toBe(false)
    expect(result.error).toContain("No company assigned")
  })

  it("rejects when no company assigned", async () => {
    mockGetProfile.mockReturnValueOnce({ ...staffProfile, company_id: null })

    const result = await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(result.success).toBe(false)
    expect(result.error).toContain("No company assigned")
  })

  it("rejects empty body", async () => {
    const result = await saveTemplate("template-1", "", "Template Name")
    expect(result.success).toBe(false)
    expect(result.error).toContain("cannot be empty")
  })

  it("revalidates on success", async () => {
    await saveTemplate("template-1", "Hello {{customer_name}}", "Template Name")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/templates")
  })
})

describe("resetTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveValue = { data: null, error: null }
  })

  it("allows company_admin to reset template", async () => {
    const result = await resetTemplate("renewal")
    expect(result.success).toBe(true)
  })

  it("allows staff with templates:edit grant to reset template", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)
    mockResolveValue = { data: { id: "grant-1" }, error: null }

    const result = await resetTemplate("renewal")
    expect(result.success).toBe(true)
  })

  it("rejects staff without templates:edit grant", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)

    const result = await resetTemplate("renewal")
    expect(result.success).toBe(false)
    expect(result.error).toContain("don't have permission")
  })

  it("rejects invalid template type", async () => {
    const result = await resetTemplate("invalid" as any)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid template type")
  })

  it("revalidates on success", async () => {
    await resetTemplate("renewal")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/templates")
  })
})
