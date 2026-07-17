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
