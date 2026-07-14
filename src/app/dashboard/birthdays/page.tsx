import { getProfile, getBirthdaysToday, getBirthdaysThisMonth } from "@/lib/supabase/queries"
import { EmptyState } from "@/components/ui/empty-state"
import { CalendarDays } from "lucide-react"
import { redirect } from "next/navigation"

export default async function BirthdaysPage(props: {
  searchParams: Promise<{ filter?: string }>
}) {
  const searchParams = await props.searchParams
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (profile.role === "super_admin") redirect("/super-admin/companies")

  const showToday = searchParams.filter === "today"
  const records = showToday ? await getBirthdaysToday() : await getBirthdaysThisMonth()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Birthdays</h1>
        <p className="text-sm text-muted-foreground">Customer birthdays to send greetings</p>
      </div>

      <div className="mb-6 flex gap-2">
        <a
          href="/dashboard/birthdays"
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            !showToday ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          This month
        </a>
        <a
          href="/dashboard/birthdays?filter=today"
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            showToday ? "bg-black text-white" : "border hover:bg-gray-50"
          }`}
        >
          Today
        </a>
      </div>

      <div className="rounded-lg border">
        {records.length === 0 ? (
          showToday ? (
            <EmptyState icon={CalendarDays} title="No birthdays today" />
          ) : (
            <EmptyState icon={CalendarDays} title="No birthdays this month" />
          )
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Policy No</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mobile</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date of birth</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{r.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.policy_no}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.mobile_no}</td>
                  <td className="px-4 py-3">{r.driver_dob || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
