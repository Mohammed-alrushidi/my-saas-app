import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import { getMyPermissionRequests, getCompanyPermissionRequests } from "./actions"
import PermissionRequestForm from "./permission-request-form"
import AdminRequestList from "./admin-request-list"

export default async function PermissionsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role === "super_admin") redirect("/super-admin/companies")

  const isStaff = profile.role === "staff"
  const isAdmin = profile.role === "company_admin"

  let requests: Awaited<ReturnType<typeof getMyPermissionRequests>> = []
  if (isStaff) {
    requests = await getMyPermissionRequests()
  }

  const companyRequests = isAdmin ? await getCompanyPermissionRequests() : null

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-2xl font-bold">Permission Requests</h1>

      {isStaff && <PermissionRequestForm />}

      {isAdmin && companyRequests && (
        <AdminRequestList
          initialPending={companyRequests.pending}
          initialReviewed={companyRequests.reviewed}
        />
      )}

      {isAdmin && !companyRequests && (
        <div className="rounded-lg border bg-blue-50 p-4 text-sm text-blue-800">
          Company admins already have these permissions.
        </div>
      )}

      {isStaff && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">My Requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Permission</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Review Note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">{r.permission}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : r.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.review_note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
