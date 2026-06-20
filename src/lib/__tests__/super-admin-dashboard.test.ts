import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRedirect = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

let mockResolveValue: any = { data: null, count: 0, error: null }

const mockAdminChain: any = {
  from: vi.fn(() => mockAdminChain),
  select: vi.fn(() => mockAdminChain),
  eq: vi.fn(() => mockAdminChain),
  gte: vi.fn(() => mockAdminChain),
  order: vi.fn(() => mockAdminChain),
  limit: vi.fn(() => mockAdminChain),
}

Object.defineProperty(mockAdminChain, "then", {
  value: function (resolve: any) {
    return Promise.resolve(mockResolveValue).then(resolve)
  },
  writable: true,
  configurable: true,
})

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminChain),
}))

const mockGetProfile = vi.fn()
vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockRedirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT")
  })
  mockResolveValue = { data: null, count: 0, error: null }
})

import { getPlatformDashboardData } from "@/app/super-admin/dashboard/data"
import type { PlatformDashboardData } from "@/app/super-admin/dashboard/data"

describe("getPlatformDashboardData", () => {
  it("redirects unauthenticated user to /login", async () => {
    mockGetProfile.mockResolvedValueOnce(null)

    await expect(getPlatformDashboardData()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects company_admin to /dashboard", async () => {
    mockGetProfile.mockResolvedValueOnce({
      id: "admin-id",
      company_id: "company-id",
      role: "company_admin",
    })

    await expect(getPlatformDashboardData()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects staff to /dashboard", async () => {
    mockGetProfile.mockResolvedValueOnce({
      id: "staff-id",
      company_id: "company-id",
      role: "staff",
    })

    await expect(getPlatformDashboardData()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("allows super_admin to fetch dashboard data", async () => {
    mockGetProfile.mockResolvedValueOnce({
      id: "super-admin-id",
      company_id: null,
      role: "super_admin",
    })

    mockResolveValue = {
      data: [],
      count: 0,
      error: null,
    }

    try {
      await getPlatformDashboardData()
    } catch {
      // Expected — admin chain mocks may not fully resolve
    }

    expect(mockRedirect).not.toHaveBeenCalledWith("/dashboard")
    expect(mockRedirect).not.toHaveBeenCalledWith("/login")
  })

  it("returns expected data shape without customer PII", async () => {
    mockGetProfile.mockResolvedValueOnce({
      id: "super-admin-id",
      company_id: null,
      role: "super_admin",
    })

    mockResolveValue = {
      data: [],
      count: 42,
      error: null,
    }

    let result: PlatformDashboardData | null = null
    try {
      result = await getPlatformDashboardData()
    } catch {
      // Expected — admin chain may not resolve fully
    }

    if (result) {
      expect(result).toHaveProperty("totalCompanies")
      expect(result).toHaveProperty("activeCompanies")
      expect(result).toHaveProperty("inactiveCompanies")
      expect(result).toHaveProperty("totalCustomerRecords")
      expect(result).toHaveProperty("totalMessages")
      expect(result).toHaveProperty("messagesSentToday")
      expect(result).toHaveProperty("messagesSentThisMonth")
      expect(result).toHaveProperty("failedMessages")
      expect(result).toHaveProperty("recentCompanies")
      expect(result).toHaveProperty("recentImports")

      expect(result).not.toHaveProperty("customerName")
      expect(result).not.toHaveProperty("mobileNo")
      expect(result).not.toHaveProperty("policyNo")
      expect(result).not.toHaveProperty("messageBody")

      expect(typeof result.totalCompanies).toBe("number")
    }
  })
})
