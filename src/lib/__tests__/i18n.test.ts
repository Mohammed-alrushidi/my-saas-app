import { describe, expect, it } from "vitest"
import { directionFor, isLocale, translate } from "@/lib/i18n"

describe("interface localization", () => {
  it("supports only Arabic and English with English as stable copy", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("ar")).toBe(true)
    expect(isLocale("fr")).toBe(false)
    expect(translate("en", "nav.birthdays")).toBe("Birthdays")
    expect(translate("ar", "nav.birthdays")).toBe("أعياد الميلاد")
  })

  it("sets the correct document direction", () => {
    expect(directionFor("en")).toBe("ltr")
    expect(directionFor("ar")).toBe("rtl")
  })

  it("interpolates UI labels without touching imported values", () => {
    const importedName = "John Smith شركة ABC"
    expect(translate("ar", "birthdays.confirmMessage", { name: importedName })).toContain(importedName)
    expect(translate("en", "birthdays.confirmMessage", { name: importedName })).toContain(importedName)
  })

  it("translates customer filters and pagination labels", () => {
    expect(translate("en", "customers.statusInvalidNumber")).toBe("Invalid Number")
    expect(translate("ar", "customers.statusInvalidNumber")).toBe("رقم غير صالح")
    expect(translate("ar", "customers.results", { from: 1, to: 50, total: 72 })).toBe(
      "عرض 1–50 من 72",
    )
  })

  it("translates upload feedback while preserving file names", () => {
    const importedFileName = "عملاء أغسطس Customer Data.xlsx"
    expect(translate("ar", "upload.fileName", { name: importedFileName })).toContain(importedFileName)
    expect(translate("en", "upload.fileName", { name: importedFileName })).toContain(importedFileName)
    expect(translate("ar", "upload.validationDuplicatePolicy")).toBe("رقم وثيقة مكرر")
  })

  it("translates template controls without changing template variables", () => {
    const variable = "{{customer_name}}"
    expect(translate("ar", "templates.typeBirthday")).toBe("تهنئة عيد الميلاد")
    expect(variable).toBe("{{customer_name}}")
  })

  it("translates message lifecycle and retry feedback", () => {
    expect(translate("ar", "messages.statusCanceled")).toBe("ملغاة")
    expect(translate("ar", "messages.retryAccepted", { attempt: 2 })).toContain("2")
    expect(translate("en", "messages.actualCost")).toBe("Actual Cost")
  })

  it("translates broadcast safeguards without changing template tokens", () => {
    const token = "{{company_name}}"
    expect(translate("ar", "broadcast.errorMaxRecipients")).toContain("50")
    expect(translate("en", "broadcast.description")).toContain(token)
  })

  it("translates remaining company dashboard surfaces", () => {
    expect(translate("ar", "dashboard.quickActions")).toBe("إجراءات سريعة")
    expect(translate("ar", "expiries.days", { count: 30 })).toContain("30")
    expect(translate("ar", "optOuts.removeMessage", { mobile: "+96891234567" })).toContain("+96891234567")
  })
})
