const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const DAY_MS = 24 * 60 * 60 * 1000

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth) return null

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseExcelSerial(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null

  const wholeDays = Math.floor(value)
  if (wholeDays === 60) return null // Excel's non-existent 1900-02-29.

  const adjustedDays = wholeDays > 60 ? wholeDays - 1 : wholeDays
  const timestamp = Date.UTC(1899, 11, 31) + adjustedDays * DAY_MS
  const date = new Date(timestamp)

  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * Parse a spreadsheet date into the database-safe YYYY-MM-DD format.
 *
 * Day-first is the company default for numeric dates. Ambiguous US-style
 * month-first values are intentionally not guessed.
 */
export function parseSpreadsheetDate(value: unknown): string | null {
  if (value == null || value === "") return null

  if (typeof value === "number") return parseExcelSerial(value)

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return toIsoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value !== "string") return null

  const normalized = normalizeDigits(value).trim()
  if (!normalized) return null

  const yearFirst = /^(\d{4})([\/.-])(\d{1,2})\2(\d{1,2})$/.exec(normalized)
  if (yearFirst) {
    return toIsoDate(Number(yearFirst[1]), Number(yearFirst[3]), Number(yearFirst[4]))
  }

  const dayFirst = /^(\d{1,2})([\/.-])(\d{1,2})\2(\d{4})$/.exec(normalized)
  if (dayFirst) {
    return toIsoDate(Number(dayFirst[4]), Number(dayFirst[3]), Number(dayFirst[1]))
  }

  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return parseExcelSerial(Number(normalized))
  }

  return null
}
