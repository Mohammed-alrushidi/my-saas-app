import twilio from "twilio"

export const MAX_WEBHOOK_FIELD_LENGTH = 255

export function canonicalTwilioWebhookUrl(request: Request): string {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get("x-forwarded-proto")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const host = forwardedHost ?? request.headers.get("host") ?? url.host
  const proto = (forwardedProto ?? url.protocol.replace(/:$/, "")).replace(/:$/, "")
  return `${proto}://${host}${url.pathname}${url.search}`
}

export function webhookFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_WEBHOOK_FIELD_LENGTH) return null
  return trimmed
}

export function validateTwilioWebhook(
  request: Request,
  formData: FormData,
  authToken: string,
): boolean {
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === "string") params[key] = value
  })

  const signature = request.headers.get("x-twilio-signature") ?? ""
  return twilio.validateRequest(
    authToken,
    signature,
    canonicalTwilioWebhookUrl(request),
    params,
  )
}
