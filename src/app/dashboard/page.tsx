import { getProfile, getCustomerRecordsCount, getActiveCustomerCount, getCompanyImports, getUpcomingExpiries, getExpiriesCount, getBirthdaysThisMonth, getBirthdaysToday } from "@/lib/supabase/queries"
import { DeleteImportButton } from "@/components/delete-import-button"
import { EmptyState } from "@/components/ui/empty-state"
import { Inbox, Calendar, CalendarDays, Upload } from "lucide-react"
import { redirect } from "next/navigation"
import { translate, type Locale } from "@/lib/i18n"
import { getRequestLocale } from "@/lib/i18n/server"

function formatDate(
  dateStr: string | null | undefined,
  locale: Locale,
  t: (key: Parameters<typeof translate>[1]) => string,
): string {
  if (!dateStr) return t("dashboard.unknownDate")
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateStr))
  } catch {
    return t("dashboard.unknownDate")
  }
}

export default async function DashboardPage() {
  const locale = await getRequestLocale()
  const localeTag = locale === "ar" ? "ar-OM" : "en-GB"
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values)
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  if (profile.role === "super_admin") {
    redirect("/super-admin/companies")
  }

  const [customerCount, activeCount, recentImports, expiring30, expiriesCount30, birthdaysMonth, birthdaysToday] = await Promise.all([
    getCustomerRecordsCount(),
    getActiveCustomerCount(),
    getCompanyImports(),
    getUpcomingExpiries(30, 5),
    getExpiriesCount(30),
    getBirthdaysThisMonth(),
    getBirthdaysToday(),
  ])

  const noData = customerCount === 0

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.welcome", { name: profile.full_name || profile.email })}</p>
      </div>

      {noData && (
        <div className="mb-6 rounded-lg border bg-card">
          <EmptyState icon={Inbox} title={t("dashboard.empty")} description={t("dashboard.emptyDescription")} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t("dashboard.totalCustomers")}</div>
          <div className="mt-1 text-lg font-semibold">{customerCount.toLocaleString(localeTag)}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t("dashboard.activeCustomers")}</div>
          <div className="mt-1 text-lg font-semibold">{activeCount.toLocaleString(localeTag)}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t("dashboard.expiring30")}</div>
          <div className="mt-1 text-lg font-semibold">{expiriesCount30.toLocaleString(localeTag)}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">{t("dashboard.birthdaysMonth")}</div>
          <div className="mt-1 text-lg font-semibold">{birthdaysMonth.length.toLocaleString(localeTag)}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {!noData && (
          <div className="rounded-lg border p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.upcomingExpiries")}</h2>
              <a href="/dashboard/expiries" className="text-xs font-medium text-blue-600 hover:underline">{t("dashboard.viewAll")}</a>
            </div>
            {expiring30.length > 0 ? (
              <div className="space-y-2">
                {expiring30.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[220px]">{r.customer_name}</span>
                    <span className="text-muted-foreground">
                      {r.policy_expiry_date}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Calendar} title={t("dashboard.noExpiries")} description={t("dashboard.next30Days")} />
            )}
          </div>
        )}

        {!noData && (
          <div className="rounded-lg border p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t("dashboard.birthdays")} {birthdaysToday.length > 0 && <span className="ms-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">{t("dashboard.todayCount", { count: birthdaysToday.length })}</span>}
              </h2>
              <a href="/dashboard/birthdays" className="text-xs font-medium text-blue-600 hover:underline">{t("dashboard.viewAll")}</a>
            </div>
            {birthdaysMonth.length > 0 ? (
              <div className="space-y-2">
                {birthdaysMonth.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[220px]">{r.customer_name}</span>
                    <span className="text-muted-foreground">
                      {r.driver_dob ? r.driver_dob.slice(5) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CalendarDays} title={t("dashboard.noBirthdays")} />
            )}
          </div>
        )}

        <div className="rounded-lg border p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.recentImports")}</h2>
            <a href="/dashboard/upload" className="text-xs font-medium text-blue-600 hover:underline">{t("dashboard.upload")}</a>
          </div>
          {recentImports.length === 0 ? (
            <EmptyState icon={Upload} title={t("dashboard.noImports")} />
          ) : (
            <div className="space-y-2">
              {recentImports.slice(0, 5).map((imp) => (
                <div key={imp.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate max-w-[160px]">{imp.file_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(imp.created_at, locale, t)}
                    </span>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {imp.valid_rows}/{imp.total_rows}
                  </span>
                  <DeleteImportButton importId={imp.id} fileName={imp.file_name} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.quickActions")}</h2>
          <div className="flex flex-wrap gap-2">
            <a href="/dashboard/upload" className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">{t("dashboard.uploadExcel")}</a>
            <a href="/dashboard/expiries" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">{t("dashboard.viewExpiries")}</a>
            <a href="/dashboard/birthdays" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">{t("dashboard.viewBirthdays")}</a>
          </div>
        </div>
      </div>
    </div>
  )
}
