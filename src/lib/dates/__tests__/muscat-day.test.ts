import { describe, it, expect } from "vitest"
import { getMuscatBusinessDayBounds } from "@/lib/dates/muscat-day"

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
