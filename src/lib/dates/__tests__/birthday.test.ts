import { describe, it, expect } from "vitest"
import { isBirthdayToday, isLeapYear } from "@/lib/dates/birthday"

describe("isLeapYear", () => {
  it("handles standard Gregorian rules", () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2025)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
  })
})

describe("isBirthdayToday", () => {
  const businessDate = "2025-06-15"

  it("matches month and day regardless of birth year", () => {
    expect(isBirthdayToday("1990-06-15", businessDate)).toBe(true)
    expect(isBirthdayToday("2001-06-15", businessDate)).toBe(true)
  })

  it("rejects non-matching month or day", () => {
    expect(isBirthdayToday("1990-06-16", businessDate)).toBe(false)
    expect(isBirthdayToday("1990-07-15", businessDate)).toBe(false)
  })

  it("returns false for null, empty, or malformed DOBs", () => {
    expect(isBirthdayToday(null, businessDate)).toBe(false)
    expect(isBirthdayToday(undefined, businessDate)).toBe(false)
    expect(isBirthdayToday("", businessDate)).toBe(false)
    expect(isBirthdayToday("15/06/1990", businessDate)).toBe(false)
    expect(isBirthdayToday("not-a-date", businessDate)).toBe(false)
  })

  it("greets a Feb-29 birthday on Feb 29 in leap years", () => {
    expect(isBirthdayToday("2000-02-29", "2024-02-29")).toBe(true)
  })

  it("greets a Feb-29 birthday on Feb 28 in non-leap years (approved D3 rule)", () => {
    expect(isBirthdayToday("2000-02-29", "2025-02-28")).toBe(true)
    expect(isBirthdayToday("2000-02-29", "2100-02-28")).toBe(true) // 2100 not leap
  })

  it("does not greet a Feb-29 birthday on Mar 1 in non-leap years", () => {
    expect(isBirthdayToday("2000-02-29", "2025-03-01")).toBe(false)
    expect(isBirthdayToday("2000-02-29", "2025-02-27")).toBe(false)
  })

  it("does not shift ordinary birthdays", () => {
    expect(isBirthdayToday("1990-02-28", "2025-02-27")).toBe(false)
    expect(isBirthdayToday("1990-02-28", "2025-02-28")).toBe(true)
    expect(isBirthdayToday("1990-03-01", "2025-02-28")).toBe(false)
  })
})
