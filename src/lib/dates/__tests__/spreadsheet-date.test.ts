import { describe, expect, it } from "vitest"
import { parseSpreadsheetDate } from "@/lib/dates/spreadsheet-date"

describe("parseSpreadsheetDate", () => {
  it.each([
    ["30/08/1988", "1988-08-30"],
    ["30/8/1988", "1988-08-30"],
    ["30-08-1988", "1988-08-30"],
    ["30.8.1988", "1988-08-30"],
    ["1988-08-30", "1988-08-30"],
    ["1988/8/30", "1988-08-30"],
    [" 30/08/1988 ", "1988-08-30"],
    ["٣٠/٠٨/١٩٨٨", "1988-08-30"],
    ["۳۰/۰۸/۱۹۸۸", "1988-08-30"],
  ])("parses %s", (input, expected) => {
    expect(parseSpreadsheetDate(input)).toBe(expected)
  })

  it("parses native dates and modern Excel serials", () => {
    expect(parseSpreadsheetDate(new Date("1988-08-30T00:00:00.000Z"))).toBe("1988-08-30")
    expect(parseSpreadsheetDate(32385)).toBe("1988-08-30")
    expect(parseSpreadsheetDate("32385")).toBe("1988-08-30")
  })

  it.each([
    "",
    "31/02/1988",
    "29/02/1989",
    "13/13/1988",
    "1988/02-20",
    "08/30/1988",
    "not-a-date",
  ])("rejects invalid or unsupported value %s", (input) => {
    expect(parseSpreadsheetDate(input)).toBeNull()
  })

  it("accepts a real leap day", () => {
    expect(parseSpreadsheetDate("29/02/1988")).toBe("1988-02-29")
  })
})
