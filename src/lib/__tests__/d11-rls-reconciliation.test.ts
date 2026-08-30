import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const reconciliationSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/00016_reconcile_production_rls_helpers.sql",
  ),
  "utf8",
)

const hardeningSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/00017_block_profile_self_role_escalation.sql",
  ),
  "utf8",
)

const profileReadHardeningSql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/00018_restrict_company_profile_reads_to_admins.sql",
  ),
  "utf8",
)

const helperNames = [
  "current_company_id",
  "current_user_role",
  "is_super_admin",
  "profile_exists",
]

describe("D11 RLS reconciliation migration", () => {
  it("reproduces the production recursion helpers with caller-scoped inputs", () => {
    for (const helperName of helperNames) {
      expect(reconciliationSql).toMatch(
        new RegExp(
          `create or replace function public\\.${helperName}\\(\\)[\\s\\S]*?stable[\\s\\S]*?security definer[\\s\\S]*?set search_path = public`,
          "i",
        ),
      )
      expect(reconciliationSql).toMatch(
        new RegExp(
          `grant execute on function public\\.${helperName}\\(\\) to public, anon, authenticated, service_role`,
          "i",
        ),
      )
    }

    expect(reconciliationSql).toMatch(/where id = auth\.uid\(\)/i)
    expect(reconciliationSql).not.toMatch(
      /\([^)]*(p_|target_|user_id)[^)]*\)/i,
    )
  })

  it("rewrites recursive super-admin and company-profile policies", () => {
    const superAdminPolicies = [
      "super_admin_select_companies",
      "super_admin_insert_companies",
      "super_admin_update_companies",
      "super_admin_delete_companies",
      "super_admin_read_all_profiles",
      "super_admin_insert_profiles",
      "super_admin_update_profiles",
      "super_admin_select_customer_records",
      "super_admin_select_templates",
    ]

    for (const policyName of superAdminPolicies) {
      expect(reconciliationSql).toMatch(
        new RegExp(
          `create policy "${policyName}"[\\s\\S]*?public\\.is_super_admin\\(\\)`,
          "i",
        ),
      )
    }

    expect(reconciliationSql).toMatch(
      /create policy "company_admin_read_company_profiles"[\s\S]*?company_id = public\.current_company_id\(\)/i,
    )
    expect(reconciliationSql).not.toMatch(/super_admin_select_all_companies/i)
  })

  it("does not alter tables or customer data", () => {
    expect(reconciliationSql).not.toMatch(
      /^\s*(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table)\b/im,
    )
  })

  it("removes profile self-update without weakening read or admin policies", () => {
    expect(hardeningSql).toMatch(
      /drop policy if exists "users_update_own_profile" on public\.profiles/i,
    )
    expect(hardeningSql).not.toMatch(
      /create policy "users_update_own_profile"/i,
    )
    expect(hardeningSql).not.toMatch(
      /drop policy if exists "(users_read_own_profile|super_admin_update_profiles)"/i,
    )
  })

  it("hardens policy metadata only", () => {
    expect(hardeningSql).not.toMatch(
      /^\s*(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table|grant\s+|revoke\s+)\b/im,
    )
  })

  it("restricts company-wide profile reads to company admins in the same tenant", () => {
    expect(profileReadHardeningSql).toMatch(
      /drop policy if exists "company_admin_read_company_profiles" on public\.profiles/i,
    )
    expect(profileReadHardeningSql).toMatch(
      /create policy "company_admin_read_company_profiles"[\s\S]*?public\.current_user_role\(\)\s*=\s*'company_admin'[\s\S]*?company_id\s*=\s*public\.current_company_id\(\)/i,
    )
  })

  it("preserves own-profile and super-admin reads without changing data or grants", () => {
    expect(profileReadHardeningSql).not.toMatch(
      /drop policy if exists "(users_read_own_profile|super_admin_read_all_profiles)"/i,
    )
    expect(profileReadHardeningSql).not.toMatch(
      /^\s*(insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table|grant\s+|revoke\s+)\b/im,
    )
  })
})
