import { getProfile, getCustomerRecordsCount, getActiveCustomerCount, getCompanyImports, getUpcomingExpiries, getExpiriesCount, getBirthdaysThisMonth, getBirthdaysToday } from "@/lib/supabase/queries"
import { DeleteImportButton } from "@/components/delete-import-button"
import { EmptyState } from "@/components/ui/empty-state"
import { Inbox, Calendar, CalendarDays, Upload } from "lucide-react"
import { redirect } from "next/navigation"

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown date"
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateStr))
  } catch {
    return "Unknown date"
  }
}

export default async function DashboardPage() {
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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {profile.full_name || profile.email}
        </p>
      </div>

      {noData && (
        <div className="mb-6 rounded-lg border bg-card">
          <EmptyState icon={Inbox} title="No customer records yet" description="Start by uploading an Excel file." />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total Customers</div>
          <div className="mt-1 text-lg font-semibold">{customerCount.toLocaleString()}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Active (can message)</div>
          <div className="mt-1 text-lg font-semibold">{activeCount.toLocaleString()}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Expiring in 30 days</div>
          <div className="mt-1 text-lg font-semibold">{expiriesCount30.toLocaleString()}</div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Birthdays this month</div>
          <div className="mt-1 text-lg font-semibold">{birthdaysMonth.length.toLocaleString()}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {!noData && (
          <div className="rounded-lg border p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Upcoming expiries (30 days)</h2>
              <a href="/dashboard/expiries" className="text-xs font-medium text-blue-600 hover:underline">View all</a>
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
              <EmptyState icon={Calendar} title="No policies expiring" description="in the next 30 days." />
            )}
          </div>
        )}

        {!noData && (
          <div className="rounded-lg border p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Birthdays {birthdaysToday.length > 0 && <span className="ml-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">{birthdaysToday.length} today</span>}
              </h2>
              <a href="/dashboard/birthdays" className="text-xs font-medium text-blue-600 hover:underline">View all</a>
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
              <EmptyState icon={CalendarDays} title="No birthdays this month" />
            )}
          </div>
        )}

        <div className="rounded-lg border p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent imports</h2>
            <a href="/dashboard/upload" className="text-xs font-medium text-blue-600 hover:underline">Upload</a>
          </div>
          {recentImports.length === 0 ? (
            <EmptyState icon={Upload} title="No imports yet" />
          ) : (
            <div className="space-y-2">
              {recentImports.slice(0, 5).map((imp) => (
                <div key={imp.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate max-w-[160px]">{imp.file_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(imp.created_at)}
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
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            <a href="/dashboard/upload" className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">Upload Excel</a>
            <a href="/dashboard/expiries" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">View expiries</a>
            <a href="/dashboard/birthdays" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">View birthdays</a>
          </div>
        </div>
      </div>
    </div>
  )
}
