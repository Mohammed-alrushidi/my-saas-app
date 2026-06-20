import { getProfile, getCompanies } from "@/lib/supabase/queries"
import { redirect } from "next/navigation"
import { createCompany, toggleCompanyStatus } from "./actions"

export default async function CompaniesPage(props: {
  searchParams: Promise<{ error?: string; success?: string; created?: string }>
}) {
  const searchParams = await props.searchParams
  const profile = await getProfile()

  if (!profile || profile.role !== "super_admin") {
    redirect("/login")
  }

  const companies = await getCompanies()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Companies</h1>
        <p className="text-muted-foreground">Manage insurance companies on the platform</p>
      </div>

      {searchParams.error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {searchParams.error}
        </div>
      )}

      {searchParams.created && (
        <div className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Company created successfully. A password reset email has been sent to the admin email address.
          The admin can follow the link to set their own password and log in.
        </div>
      )}

      {searchParams.success && (
        <div className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          {searchParams.success}
        </div>
      )}

      <div className="mb-8 rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">Create new company</h2>
        <form className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">Company name</label>
              <input
                id="name"
                name="name"
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Al Rajhi Insurance"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="domain" className="text-sm font-medium">Domain (unique key)</label>
              <input
                id="domain"
                name="domain"
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="al-rajhi"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="admin_email" className="text-sm font-medium">Admin email</label>
              <input
                id="admin_email"
                name="admin_email"
                type="email"
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="admin@alrajhi.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="admin_name" className="text-sm font-medium">Admin name</label>
              <input
                id="admin_name"
                name="admin_name"
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Ahmed Ali"
              />
            </div>
          </div>

          <button
            type="submit"
            formAction={createCompany}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create company
          </button>
        </form>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3 font-medium">All companies</div>
        {companies.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No companies yet. Create your first company above.
          </div>
        ) : (
          <div className="divide-y">
            {companies.map((company) => (
              <div key={company.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">{company.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Domain: {company.domain} &middot; Created: {new Date(company.created_at).toLocaleDateString()}
                  </div>
                  <div className="mt-1">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      company.subscription_status === "active"
                        ? "bg-green-50 text-green-700"
                        : company.subscription_status === "trial"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-gray-50 text-gray-500"
                    }`}>
                      {company.subscription_status}
                    </span>
                  </div>
                </div>

                <form>
                  <input type="hidden" name="company_id" value={company.id} />
                  <input type="hidden" name="is_active" value={(!company.is_active).toString()} />
                  <button
                    type="submit"
                    formAction={toggleCompanyStatus}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      company.is_active
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-green-50 text-green-600 hover:bg-green-100"
                    }`}
                  >
                    {company.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
