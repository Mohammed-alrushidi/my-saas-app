import { describe, it, expect } from "vitest"
import { addDaysIso, getMuscatBusinessDayBounds, muscatExpiryWindow, muscatMonthDayRange } from "@/lib/dates/muscat-day"

describe("getMuscatBusinessDayBounds", () => {
  it("returns a normal Muscat business day for a fixed UTC morning", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-07-01T12:00:00Z"))

    expect(result.businessDate).toBe("2026-07-01")
    expect(result.startUtc).toBe("2026-06-30T20:00:00.000Z")
    expect(result.endUtcExclusive).toBe("2026-07-01T20:00:00.000Z")
  })

  it("handles a UTC time immediately before Muscat midnight correctly", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-06-30T19:59:59Z"))

    expect(result.businessDate).toBe("2026-06-30")
    expect(result.startUtc).toBe("2026-06-29T20:00:00.000Z")
    expect(result.endUtcExclusive).toBe("2026-06-30T20:00:00.000Z")
  })

  it("handles a UTC time immediately after Muscat midnight correctly", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-07-01T20:01:00Z"))

    expect(result.businessDate).toBe("2026-07-02")
    expect(result.startUtc).toBe("2026-07-01T20:00:00.000Z")
    expect(result.endUtcExclusive).toBe("2026-07-02T20:00:00.000Z")
  })

  it("handles month rollover", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-01-31T12:00:00Z"))

    expect(result.businessDate).toBe("2026-01-31")
    expect(result.startUtc).toBe("2026-01-30T20:00:00.000Z")
    expect(result.endUtcExclusive).toBe("2026-01-31T20:00:00.000Z")
  })

  it("handles year rollover", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-12-31T12:00:00Z"))

    expect(result.businessDate).toBe("2026-12-31")
    expect(result.startUtc).toBe("2026-12-30T20:00:00.000Z")
    expect(result.endUtcExclusive).toBe("2026-12-31T20:00:00.000Z")
  })

  it("returns UTC ISO strings for database usage", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-07-01T12:00:00Z"))

    expect(result.startUtc).toContain("T20:00:00.000Z")
    expect(result.endUtcExclusive).toContain("T20:00:00.000Z")
    expect(new Date(result.startUtc).toISOString()).toBe(result.startUtc)
    expect(new Date(result.endUtcExclusive).toISOString()).toBe(result.endUtcExclusive)
  })

  it("uses half-open range semantics", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-07-01T12:00:00Z"))

    expect(new Date(result.startUtc).getTime()).toBeLessThan(new Date(result.endUtcExclusive).getTime())
    expect(new Date(result.startUtc).getTime()).not.toEqual(new Date(result.endUtcExclusive).getTime())
  })

  it("returns exactly 24 hours", () => {
    const result = getMuscatBusinessDayBounds(new Date("2026-07-01T12:00:00Z"))

    expect(new Date(result.endUtcExclusive).getTime() - new Date(result.startUtc).getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe("addDaysIso", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysIso("2025-01-31", 1)).toBe("2025-02-01")
  })
  it("adds days across year boundaries", () => {
    expect(addDaysIso("2025-12-31", 1)).toBe("2026-01-01")
  })
  it("handles leap-year February", () => {
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29")
    expect(addDaysIso("2024-02-28", 2)).toBe("2024-03-01")
  })
})

describe("muscatExpiryWindow", () => {
  it("anchors on the Muscat business date, not UTC, near midnight", () => {
    // 20:30 UTC = 00:30 next day in Muscat (+04:00)
    const now = new Date("2025-06-15T20:30:00Z")
    const w = muscatExpiryWindow(now, 30)
    expect(w.start).toBe("2025-06-16")
    expect(w.end).toBe("2025-07-16")
  })
  it("stays on the same Muscat day before midnight UTC", () => {
    const now = new Date("2025-06-15T19:59:00Z") // 23:59 Muscat
    expect(muscatExpiryWindow(now, 7).start).toBe("2025-06-15")
  })
})

describe("muscatMonthDayRange", () => {
  it("builds numeric MMDD bounds from the Muscat month", () => {
    expect(muscatMonthDayRange(new Date("2025-06-15T12:00:00Z"))).toEqual({ start: 601, end: 631 })
  })
  it("uses the Muscat month after midnight rollover", () => {
    // 2025-07-31 20:30 UTC = 2025-08-01 in Muscat
    expect(muscatMonthDayRange(new Date("2025-07-31T20:30:00Z"))).toEqual({ start: 801, end: 831 })
  })
})
