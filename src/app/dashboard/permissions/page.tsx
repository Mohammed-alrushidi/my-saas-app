import { getProfile } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import { getMyPermissionRequests } from "./actions"
import PermissionRequestForm from "./permission-request-form"

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

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Permission Requests</h1>

      {isStaff && <PermissionRequestForm />}

      {isAdmin && (
        <div className="rounded-lg border bg-blue-50 p-4 text-sm text-blue-800">
          Company admins already have these permissions.
          Approval workflow will be added in Phase 3.
        </div>
      )}

      {isStaff && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">My Requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Permission</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Submitted</th>
                    <th className="pb-2 font-medium">Review Note</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.permission}</td>
                      <td className="py-2 pr-4">
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
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-muted-foreground">
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
