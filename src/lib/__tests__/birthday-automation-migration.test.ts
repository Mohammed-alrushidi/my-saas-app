import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/00020_birthday_automation_controls.sql"),
  "utf8",
)

describe("birthday automation migration", () => {
  it("defaults automation off and adds the dedicated staff permission", () => {
    expect(sql).toMatch(/is_enabled boolean not null default false/i)
    expect(sql).toMatch(/'birthday:send'/i)
    expect(sql).toMatch(/birthday_automation_settings/i)
  })

  it("requires tenant-scoped RLS and records cost and annual identity fields", () => {
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/current_company_id\(\)/i)
    expect(sql).toMatch(/estimated_cost_baisa/i)
    expect(sql).toMatch(/actual_cost_baisa/i)
    expect(sql).toMatch(/birthday_year/i)
    expect(sql).toMatch(/birthday_automation_audit/i)
  })

  it("models approved provider Marketing templates without enabling one", () => {
    expect(sql).toMatch(/provider_category/i)
    expect(sql).toMatch(/provider_status text not null default 'draft'/i)
    expect(sql).not.toMatch(/whatsapp_live_enabled/i)
    expect(sql).toMatch(/provider_template_id[\s\S]*\^HX\[0-9A-Fa-f\]\{32\}\$/i)
    expect(sql).toMatch(/revoke insert, update[\s\S]*message_templates[\s\S]*authenticated/i)
    expect(sql).toMatch(/grant update \(name, body, is_default\)/i)
  })

  it("atomically reserves birthday sends under tenant limits and budget", () => {
    expect(sql).toMatch(/function public\.claim_birthday_message/i)
    expect(sql).toMatch(/for update/i)
    expect(sql).toMatch(/limit_reached/i)
    expect(sql).toMatch(/budget_reached/i)
    expect(sql).toMatch(/on conflict do nothing/i)
    expect(sql).not.toMatch(/on conflict \(idempotency_key\)/i)
    expect(sql).toMatch(/p_recipient_mobile[\s\S]*p_birthday_year/i)
    expect(sql).toMatch(/count\(\*\)[\s\S]*customer_records/i)
    expect(sql).toMatch(
      /revoke all on function public\.claim_birthday_message[\s\S]*from public,\s*anon,\s*authenticated/i,
    )
    expect(sql).toMatch(/grant execute[\s\S]*service_role/i)
    expect(sql).toMatch(/public\.companies[\s\S]*is_active = true/i)
    expect(sql).toMatch(/company_suspended/i)
  })

  it("stores read and canceled outcomes without pretending they were delivered or failed", () => {
    expect(sql).toMatch(/'read'/i)
    expect(sql).toMatch(/'canceled'/i)
    expect(sql).toMatch(/audit_birthday_message_lifecycle/i)
    expect(sql).toMatch(/actual_cost_baisa is distinct from old\.actual_cost_baisa/i)
  })
})
