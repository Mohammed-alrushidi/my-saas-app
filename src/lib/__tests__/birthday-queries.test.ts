import { beforeEach, describe, expect, it, vi } from "vitest"

const profile = {
  id: "admin-1",
  company_id: "company-1",
  role: "company_admin",
  is_active: true,
}

function profileClient() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: profile, error: null })),
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: profile.id } } })),
    },
    from: vi.fn(() => builder),
  }
}

function birthdayClient() {
  let usedTextLikeOnDate = false
  let usedMonthDayRange = false

  const row = {
    id: "customer-1",
    company_id: profile.company_id,
    customer_name: "Birthday Customer",
    driver_dob: "1988-08-30",
    driver_birth_mmdd: 830,
  }

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    like: vi.fn((column: string) => {
      if (column === "driver_dob") usedTextLikeOnDate = true
      return builder
    }),
    gte: vi.fn((column: string) => {
      if (column === "driver_birth_mmdd") usedMonthDayRange = true
      return builder
    }),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: vi.fn((resolve: (value: unknown) => unknown) => {
      if (usedTextLikeOnDate) {
        return Promise.resolve({
          data: null,
          error: { message: "operator does not exist: date ~~ unknown" },
        }).then(resolve)
      }

      return Promise.resolve({
        data: usedMonthDayRange ? [row] : [],
        error: null,
      }).then(resolve)
    }),
  }

  return { from: vi.fn(() => builder) }
}

const createClient = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}))

describe("birthday queries", () => {
  beforeEach(() => {
    createClient.mockReset()
  })

  it("returns an August birthday without applying LIKE to the date column", async () => {
    createClient
      .mockResolvedValueOnce(birthdayClient())
      .mockResolvedValueOnce(profileClient())

    const { getBirthdaysThisMonth } = await import("@/lib/supabase/queries")
    const result = await getBirthdaysThisMonth(new Date("2026-08-30T12:00:00Z"))

    expect(result).toHaveLength(1)
    expect(result[0].driver_dob).toBe("1988-08-30")
  })
})
