import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/00015_c4_retry_stop_broadcast_handoff.sql"),
  "utf8",
)

describe("C4 migration invariants", () => {
  it("enforces idempotent opt-outs and retry claims", () => {
    expect(sql).toMatch(/create unique index idx_opt_outs_company_mobile/i)
    expect(sql).toMatch(/create trigger sync_opt_out_customer_status/i)
    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/i)
    expect(sql).toMatch(/where company_id = new\.company_id[\s\S]*mobile_no = new\.mobile_no/i)
    expect(sql).toMatch(/revoke execute on function public\.sync_opt_out_customer_status\(\)/i)
    expect(sql).toMatch(/update public\.customer_records customer[\s\S]*from public\.opt_outs opt_out[\s\S]*opt_out\.company_id = customer\.company_id/i)
    expect(sql).toMatch(/create unique index if not exists idx_messages_retry_attempt/i)
    expect(sql).toMatch(/retry_attempt between 1 and 3/i)
  })

  it("enables RLS and separates creator and admin capabilities", () => {
    expect(sql).toMatch(/alter table public\.broadcast_drafts enable row level security/i)
    expect(sql).toMatch(/creator_insert_broadcast_drafts/i)
    expect(sql).toMatch(/staff_permission_grants/i)
    expect(sql).toMatch(/admin_select_company_broadcast_drafts/i)
    expect(sql).toMatch(/admin_update_company_broadcast_drafts/i)
    expect(sql).toMatch(/reviewed_by = auth\.uid\(\)/i)
  })
})
