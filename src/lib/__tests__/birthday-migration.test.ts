import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/00019_add_customer_birth_mmdd.sql"),
  "utf8",
)

describe("birthday month/day migration", () => {
  it("derives an indexable MMDD value from driver_dob", () => {
    expect(migrationSql).toMatch(
      /add column if not exists driver_birth_mmdd smallint[\s\S]*generated always as/i,
    )
    expect(migrationSql).toMatch(/extract\(month from driver_dob\)/i)
    expect(migrationSql).toMatch(/extract\(day from driver_dob\)/i)
  })

  it("indexes the tenant and MMDD value together", () => {
    expect(migrationSql).toMatch(
      /create index if not exists idx_customer_records_company_birth_mmdd[\s\S]*company_id, driver_birth_mmdd/i,
    )
  })

  it("does not mutate customer rows or weaken RLS", () => {
    expect(migrationSql).not.toMatch(/^\s*(insert|update|delete)\b/im)
    expect(migrationSql).not.toMatch(/\b(disable row level security|drop policy|create policy)\b/i)
  })
})
