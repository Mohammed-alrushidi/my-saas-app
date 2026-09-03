/**
 * Separate pre-live stop gate. Configuration and previews may be exercised
 * while real birthday dispatch remains impossible by default.
 */
export function isBirthdayLiveSendEnabled(): boolean {
  return process.env.BIRTHDAY_LIVE_SEND_ENABLED === "true"
}

export function isTwilioContentSid(value: string | null | undefined): value is string {
  return /^HX[0-9a-f]{32}$/i.test(value ?? "")
}
