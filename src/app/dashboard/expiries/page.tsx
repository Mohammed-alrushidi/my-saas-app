import { getProfile, getUpcomingExpiries } from "@/lib/supabase/queries"
import { EmptyState } from "@/components/ui/empty-state"
import { Calendar } from "lucide-react"
import { redirect } from "next/navigation"
import { translate } from "@/lib/i18n"
import { getRequestLocale } from "@/lib/i18n/server"

export default async function ExpiriesPage(props: {
  searchParams: Promise<{ days?: string }>
}) {
  const searchParams = await props.searchParams
  const locale = await getRequestLocale()
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(locale, key, values)
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (profile.role === "super_admin") redirect("/super-admin/companies")

  const days = parseInt(searchParams.days ?? "30", 10)
  const validDays = [7, 14, 30]
  const selectedDays = validDays.includes(days) ? days : 30

  const records = await getUpcomingExpiries(selectedDays)

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("expiries.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("expiries.description")}</p>
      </div>

      <div className="mb-6 flex gap-2">
        {validDays.map((d) => (
          <a
            key={d}
            href={`/dashboard/expiries?days=${d}`}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              selectedDays === d
                ? "bg-black text-white"
                : "border hover:bg-gray-50"
            }`}
          >
            {t("expiries.days", { count: d })}
          </a>
        ))}
      </div>

      <div className="rounded-lg border">
        {records.length === 0 ? (
          <EmptyState icon={Calendar} title={t("expiries.empty", { count: selectedDays })} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("expiries.customer")}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("expiries.policy")}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("expiries.mobile")}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("expiries.vehicle")}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("expiries.date")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3">{r.customer_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.policy_no}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.mobile_no}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.veh_make_model || "—"}</td>
                    <td className="px-4 py-3">{r.policy_expiry_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
