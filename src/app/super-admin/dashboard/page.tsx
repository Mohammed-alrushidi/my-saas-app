import { getPlatformDashboardData } from "./data"
import { EmptyState } from "@/components/ui/empty-state"
import { Building2, Upload } from "lucide-react"

function formatDateShort(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700"
    case "trial":
      return "bg-blue-50 text-blue-700"
    default:
      return "bg-gray-50 text-gray-500"
  }
}

function importStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700"
    case "processing":
      return "bg-blue-50 text-blue-700"
    default:
      return "bg-red-50 text-red-700"
  }
}

export default async function SuperAdminDashboardPage() {
  const data = await getPlatformDashboardData()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Platform Dashboard</h1>
        <p className="text-muted-foreground">Overview of all companies on the platform</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total companies" value={data.totalCompanies} />
        <StatCard label="Active companies" value={data.activeCompanies} />
        <StatCard label="Inactive companies" value={data.inactiveCompanies} />
        <StatCard label="Total customer records" value={data.totalCustomerRecords} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total messages" value={data.totalMessages} />
        <StatCard label="Sent today" value={data.messagesSentToday} />
        <StatCard label="Sent this month" value={data.messagesSentThisMonth} />
        <StatCard label="Failed messages" value={data.failedMessages} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent companies
          </h2>
          {data.recentCompanies.length === 0 ? (
            <EmptyState icon={Building2} title="No companies yet" />
          ) : (
            <div className="space-y-2">
              {data.recentCompanies.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-muted-foreground">{c.domain}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(c.subscription_status)}`}>
                      {c.subscription_status}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateShort(c.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent imports
          </h2>
          {data.recentImports.length === 0 ? (
            <EmptyState icon={Upload} title="No imports yet" />
          ) : (
            <div className="space-y-2">
              {data.recentImports.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{imp.companyName}</span>
                    <span className="text-xs text-muted-foreground">{formatDateShort(imp.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {imp.validRows}/{imp.totalRows} valid
                    </span>
                    {imp.invalidRows > 0 && (
                      <span className="text-red-600">{imp.invalidRows} errors</span>
                    )}
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${importStatusBadgeClass(imp.status)}`}>
                      {imp.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value.toLocaleString()}</div>
    </div>
  )
}
