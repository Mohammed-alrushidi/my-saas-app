export const COMPANY_PERMISSIONS = [
  "templates:edit",
  "reminder_settings:edit",
  "broadcast:create",
  "birthday:send",
] as const

export type CompanyPermission = typeof COMPANY_PERMISSIONS[number]
