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

const mockGetProfile = vi.fn(() => companyAdmin)

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
  getReminderSettings: vi.fn(),
}))

import { saveSettings, resetSettings } from "@/app/dashboard/settings/actions"
import { revalidatePath } from "next/cache"

describe("saveSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveValue = { data: null, error: null }
  })

  it("allows company_admin to save settings", async () => {
    const result = await saveSettings([30, 14, 7], true)
    expect(result.success).toBe(true)
  })

  it("allows company_admin to save with single day", async () => {
    const result = await saveSettings([7], true)
    expect(result.success).toBe(true)
  })

  it("allows staff with reminder_settings:edit grant to save settings", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)
    mockResolveValue = { data: { id: "grant-1" }, error: null }

    const result = await saveSettings([30, 14, 7], true)
    expect(result.success).toBe(true)
  })

  it("rejects staff without reminder_settings:edit grant", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)

    const result = await saveSettings([30, 14, 7], true)
    expect(result.success).toBe(false)
    expect(result.error).toContain("don't have permission")
  })

  it("rejects invalid reminder days", async () => {
    const result = await saveSettings([99], true)
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid reminder days")
  })

  it("rejects active with no days selected", async () => {
    const result = await saveSettings([], true)
    expect(result.success).toBe(false)
    expect(result.error).toContain("At least one reminder day")
  })

  it("rejects when no company assigned", async () => {
    mockGetProfile.mockReturnValueOnce({ ...staffProfile, company_id: null })
    const result = await saveSettings([30, 14, 7], true)
    expect(result.success).toBe(false)
    expect(result.error).toContain("No company assigned")
  })

  it("revalidates on success", async () => {
    await saveSettings([30, 14, 7], true)
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings")
  })
})

describe("resetSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveValue = { data: null, error: null }
  })

  it("allows company_admin to reset settings", async () => {
    const result = await resetSettings()
    expect(result.success).toBe(true)
  })

  it("allows staff with reminder_settings:edit grant to reset settings", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)
    mockResolveValue = { data: { id: "grant-1" }, error: null }

    const result = await resetSettings()
    expect(result.success).toBe(true)
  })

  it("rejects staff without reminder_settings:edit grant", async () => {
    mockGetProfile.mockReturnValueOnce(staffProfile)

    const result = await resetSettings()
    expect(result.success).toBe(false)
    expect(result.error).toContain("don't have permission")
  })

  it("revalidates on success", async () => {
    await resetSettings()
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings")
  })
})
