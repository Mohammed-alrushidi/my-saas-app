import { getProfile, getUpcomingExpiries } from "@/lib/supabase/queries"
import { EmptyState } from "@/components/ui/empty-state"
import { Calendar } from "lucide-react"
import { redirect } from "next/navigation"

export default async function ExpiriesPage(props: {
  searchParams: Promise<{ days?: string }>
}) {
  const searchParams = await props.searchParams
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (profile.role === "super_admin") redirect("/super-admin/companies")

  const days = parseInt(searchParams.days ?? "30", 10)
  const validDays = [7, 14, 30]
  const selectedDays = validDays.includes(days) ? days : 30

  const records = await getUpcomingExpiries(selectedDays)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Upcoming Expiries</h1>
        <p className="text-muted-foreground">Customer policies expiring within the selected period</p>
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
            {d} days
          </a>
        ))}
      </div>

      <div className="rounded-lg border">
        {records.length === 0 ? (
          <EmptyState icon={Calendar} title={`No policies expiring within ${selectedDays} days.`} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Policy No</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mobile</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vehicle</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expiry date</th>
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
        )}
      </div>
    </div>
  )
}
