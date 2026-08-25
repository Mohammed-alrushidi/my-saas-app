export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Match a customer's driver_dob (YYYY-MM-DD) against a business date.
 * Approved product rule: Feb-29 birthdays are greeted on Feb 28 in
 * non-leap years (and on Feb 29 itself in leap years).
 */
export function isBirthdayToday(
  driverDob: string | null | undefined,
  businessDate: string,
): boolean {
  if (!driverDob) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(driverDob).trim())
  if (!m) return false
  const [, , dobMonth, dobDay] = m
  const parts = businessDate.split("-")
  if (parts.length !== 3) return false
  const [, month, day] = parts

  if (dobMonth !== month) return false

  if (dobMonth === "02" && dobDay === "29") {
    const birthYear = Number(/^(\d{4})/.exec(businessDate)?.[1] ?? m[1])
    if (!isLeapYear(birthYear)) return day === "28"
    return day === "29"
  }

  return dobDay === day
}
