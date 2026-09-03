import { getProfile, getBirthdaysToday, getBirthdaysThisMonth } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import { BirthdayList } from "./birthday-list"
import { getBirthdayAutomationOverview } from "./actions"
import { getMuscatBusinessDayBounds } from "@/lib/dates/muscat-day"
import { isBirthdayToday } from "@/lib/dates/birthday"
import { translate } from "@/lib/i18n"
import { getRequestLocale } from "@/lib/i18n/server"

export default async function BirthdaysPage(props: {
  searchParams: Promise<{ filter?: string }>
}) {
  const searchParams = await props.searchParams
  const locale = await getRequestLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (profile.role === "super_admin") redirect("/super-admin/companies")

  const showToday = searchParams.filter === "today"
  const [records, overview] = await Promise.all([
    showToday ? getBirthdaysToday() : getBirthdaysThisMonth(),
    getBirthdayAutomationOverview(),
  ])
  const businessDate = getMuscatBusinessDayBounds().businessDate
  const rows = records.map((record) => ({
    id: record.id,
    customer_name: record.customer_name,
    policy_no: record.policy_no,
    mobile_no: record.mobile_no,
    driver_dob: record.driver_dob,
    isToday: isBirthdayToday(record.driver_dob, businessDate),
  }))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("birthdays.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("birthdays.description")}</p>
      </div>

      <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${overview?.settings?.is_enabled ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <div className="font-semibold">{t("birthdays.automatic")}</div>
        <div className="mt-0.5 text-xs">
          {overview?.settings?.is_enabled ? t("birthdays.automaticOn") : t("birthdays.automaticOff")}
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <a
          href="/dashboard/birthdays"
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            !showToday ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          {t("common.thisMonth")}
        </a>
        <a
          href="/dashboard/birthdays?filter=today"
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            showToday ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          {t("common.today")}
        </a>
      </div>

      <BirthdayList
        records={rows}
        showToday={showToday}
        automationEnabled={overview?.settings?.is_enabled ?? false}
        sendTime={overview?.settings?.send_time ?? "09:00"}
        canSend={overview?.canSend ?? false}
        templateReady={(overview?.approvedTemplates.length ?? 0) > 0}
      />
    </div>
  )
}
