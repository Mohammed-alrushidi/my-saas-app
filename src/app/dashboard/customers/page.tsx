import { getProfile } from "@/lib/supabase/queries"
import { EmptyState } from "@/components/ui/empty-state"
import { Search, Inbox } from "lucide-react"
import { redirect } from "next/navigation"
import { searchCustomers } from "./actions"
import { Button } from "@/components/ui/button"

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  allowed: "Allowed",
  invalid_number: "Invalid Number",
  opted_out: "Opted Out",
}

const STATUS_CLASSES: Record<string, string> = {
  allowed: "bg-green-100 text-green-700",
  invalid_number: "bg-red-100 text-red-700",
  opted_out: "bg-orange-100 text-orange-700",
}

export default async function CustomersPage(props: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const searchParams = await props.searchParams
  const profile = await getProfile()

  if (!profile) redirect("/login")
  if (profile.role === "super_admin") redirect("/super-admin/companies")

  const query = searchParams.q ?? ""
  const status = searchParams.status ?? "all"
  const page = Math.max(1, Number(searchParams.page) || 1)
  const { data: customers, total, page: currentPage, pageSize } = await searchCustomers(query, status, page)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-muted-foreground">Search and view imported customer records</p>
      </div>

      <form className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end" method="GET">
        <div className="flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search by name, policy number, or mobile
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={query}
            placeholder="e.g. Salim, POL001, 968..."
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="rounded-md border px-3 py-2 text-sm"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <Button type="submit">
          Search
        </Button>
      </form>

      <div className="rounded-lg border">
        {customers.length === 0 ? (
          query || status !== "all" ? (
            <EmptyState icon={Search} title="No customers match your search" />
          ) : (
            <EmptyState icon={Inbox} title="No customer records yet" description="Upload an Excel file to get started." />
          )
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Mobile</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Policy No</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Vehicle</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Expiry</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.customer_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.mobile_no}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.policy_no}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{r.veh_make_model || "—"}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{r.policy_expiry_date || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.communication_status] ?? ""}`}>
                        {STATUS_LABELS[r.communication_status] ?? r.communication_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <PaginationBar
              currentPage={currentPage}
              total={total}
              pageSize={pageSize}
              query={query}
              status={status}
            />
          </>
        )}
      </div>
    </div>
  )
}

function PaginationBar({
  currentPage,
  total,
  pageSize,
  query,
  status,
}: {
  currentPage: number
  total: number
  pageSize: number
  query: string
  status: string
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  function buildUrl(page: number): string {
    const params = new URLSearchParams()
    if (query) params.set("q", query)
    if (status && status !== "all") params.set("status", status)
    if (page > 1) params.set("page", String(page))
    const qs = params.toString()
    return `/dashboard/customers${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="flex items-center justify-between border-t px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Showing {(currentPage - 1) * pageSize + 1}&ndash;{Math.min(currentPage * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        {currentPage <= 1 ? (
          <span className="rounded-md px-3 py-1.5 text-sm text-gray-400">Previous</span>
        ) : (
          <a
            href={buildUrl(currentPage - 1)}
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
          >
            Previous
          </a>
        )}
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        {currentPage >= totalPages ? (
          <span className="rounded-md px-3 py-1.5 text-sm text-gray-400">Next</span>
        ) : (
          <a
            href={buildUrl(currentPage + 1)}
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
          >
            Next
          </a>
        )}
      </div>
    </div>
  )
}
