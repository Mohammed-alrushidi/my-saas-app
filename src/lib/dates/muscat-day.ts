export type MuscatBusinessDayBounds = {
  businessDate: string
  startUtc: string
  endUtcExclusive: string
}

export function getMuscatBusinessDayBounds(now: Date = new Date()): MuscatBusinessDayBounds {
  const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(now)
  const start = new Date(`${businessDate}T00:00:00+04:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return {
    businessDate,
    startUtc: start.toISOString(),
    endUtcExclusive: end.toISOString(),
  }
}

export function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

/**
 * Inclusive expiry window [start, end] anchored on the Muscat business date,
 * for policy_expiry_date (a plain date column).
 */
export function muscatExpiryWindow(
  now: Date = new Date(),
  days: number,
): { start: string; end: string } {
  const businessDate = getMuscatBusinessDayBounds(now).businessDate
  return { start: businessDate, end: addDaysIso(businessDate, days) }
}

/** Numeric MMDD bounds for the current Muscat business month. */
export function muscatMonthDayRange(now: Date = new Date()): { start: number; end: number } {
  const businessDate = getMuscatBusinessDayBounds(now).businessDate
  const month = Number(businessDate.slice(5, 7))
  return { start: month * 100 + 1, end: month * 100 + 31 }
}
