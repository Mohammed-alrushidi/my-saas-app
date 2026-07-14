# Insurance Renewal & Engagement SaaS

Multi-tenant SaaS platform for insurance companies to upload Excel customer records, track policy expiries and birthdays, and send timely WhatsApp reminders and greetings through an opt-out compliant system.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Auth & Database:** Supabase (Postgres + auth)
- **Styling:** Tailwind CSS + shadcn/ui + Base UI
- **Excel Parsing:** xlsx
- **WhatsApp:** Twilio WhatsApp Sandbox (production WABA postponed)
- **Testing:** vitest
- **Language:** TypeScript

---

## Main Features Completed

- Excel upload with column validation and error reporting
- Company Admin dashboard (counts, expiries, birthdays, message stats, quick actions, alerts)
- Customer records list with search and filter
- Upcoming expiries view (30/14/7 day filters)
- Birthdays view (today, this month)
- Editable message templates with variables (renewal, birthday, broadcast)
- Manual test message sending
- Broadcast/campaign flow (compose, choose audience, preview, confirm)
- Message history with expandable details and filters
- Responsive sidebar with role-gated navigation
- Customer list pagination (URL-based, 50 per page)
- Messages Load More (client-side, auto-hides when no more)
- Opt-out handling (Reply STOP, block future sends)
- Multi-role access (Super Admin, Company Admin, Staff)
- Dashboard empty-state placeholders (expiries/birthdays cards stay visible and clear when no data)
- Automated Cron scheduler for renewal reminders and birthday greetings (Asia/Muscat timezone, exact-stage matching, per-day dedupe)
- Server-side role checks for all admin actions (super_admin and company_admin gates)
- Super Admin platform dashboard with aggregate metrics (total companies, messages, imports, recent activity)
- Super Admin sidebar navigation with active link highlighting
- Design unification: buttons migrated to shadcn, spacing/table/text polish, card elevation, alert/dialog tokens
- Broadcast production bug fixes: stuck send, Server Components render crash, safe server action patterns
- Mock WhatsApp sandbox mode (`MOCK_MODE=true`) — test broadcasts without real messages

---

## Setup

### Prerequisites

- Node.js 18+
- npm
- Supabase account (free tier)
- Twilio account (for WhatsApp Sandbox)

### Local Setup

```bash
# 1. Clone and install
npm install

# 2. Copy environment variables
cp .env.example .env.local
# Then fill in your values (see table below)

# 3. Run database migrations
# Apply migrations from supabase/ directory via Supabase dashboard or CLI

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `[stored in .env.local]` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | `[stored in .env.local]` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | `[stored in .env.local]` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `[stored in .env.local]` |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp sender number | `+14155238886` (sandbox) |
| `SITE_URL` | Server-side URL for Twilio delivery callbacks | `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_URL` | Frontend URL for password reset redirects | `http://localhost:3000` |
| `CRON_SECRET` | Secret token for cron endpoint auth | `[random string, e.g. openssl rand -hex 32]` |
| `MOCK_MODE` | Enable mock WhatsApp provider (MVP/testing only — no real messages sent) | `true` |
| `WHATSAPP_LIVE_ENABLED` | Explicit second safety gate required in addition to `MOCK_MODE=false` before real WhatsApp sending is allowed | `false` |

Never commit `.env.local` or expose these values.

---

## Supabase Setup

1. Create a new Supabase project.
2. Run the SQL migrations in the `supabase/` directory to create tables and RLS policies.
3. Enable Email + Password authentication in Supabase Auth settings.
4. Create the first company and user via the Supabase dashboard or seed script.

---

## Twilio WhatsApp Sandbox Notes

This project uses the **Twilio WhatsApp Sandbox** for development and testing.

**Limitations:**
- Recipients must send a WhatsApp opt-in message to the sandbox number before receiving messages.
- Sandbox sessions expire after 72 hours of inactivity (7 days with activity).
- Works with only a handful of test numbers.
- Messages include "Sent from a Twilio Sandbox" prefix.

**Mock mode (MOCK_MODE):**
For MVP/testing without Twilio, set `MOCK_MODE=true`. This uses a mock provider that simulates success without sending any real WhatsApp message. Mock IDs are prefixed with `mock-sid-`. No Twilio credentials are required when mock mode is enabled.

**Production path:**
For real customer messaging, upgrade to a production WhatsApp Business Account (WABA) through a Meta BSP. This requires business verification, WABA approval, and pre-approved message templates. This is currently postponed.

---

## How to Run Locally

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

---

## Scheduler (Cron)

Automated renewal reminders and birthday greetings via a cron endpoint.

### Endpoint

```
GET /api/cron/scheduler
```

### Authentication

Requires the `CRON_SECRET` environment variable. Pass the secret via one of:

- Header: `x-cron-secret: YOUR_CRON_SECRET`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`

Returns `401 Unauthorized` if the secret is missing or wrong. Returns `500` if the scheduler itself throws.

### What It Does

Each invocation:

1. Fetches all active companies.
2. For each active company with enabled `reminder_settings`:
   - **Renewal reminders:** For each configured stage (e.g. 30, 14, 7 days before expiry), finds customers whose `policy_expiry_date` matches exactly `today + days` (Asia/Muscat local date). Excludes opted-out and invalid-number customers. Deduplicates against messages already sent today.
   - **Birthday greetings:** Finds customers whose `driver_dob` month/day matches today's month/day (Asia/Muscat local date). Excludes opted-out and invalid-number customers. Deduplicates against messages already sent today.
3. Inserts messages into the `messages` table for all eligible customers.

**Deduplication:** Scoped to the current Asia/Muscat local day. Old messages from previous days or years do not block today's run. Running the endpoint multiple times on the same day does not duplicate messages.

**Missing template resilience:** If no template exists for a message type (renewal or birthday), that type is skipped for the company. The other type still processes. The scheduler does not crash.

### MVP Note

Messages are inserted with `status = "sent"`, but **no real WhatsApp provider is called yet**. This validates the scheduling logic, deduplication, and data pipeline end-to-end. Provider integration is the next slice.

### Local Testing

```powershell
# PowerShell
$headers = @{ "x-cron-secret" = "your-secret" }
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/scheduler" -Headers $headers
```

```bash
# curl
curl -H "x-cron-secret: your-secret" http://localhost:3000/api/cron/scheduler
```

### Production Notes

- Set `CRON_SECRET` in your hosting environment before enabling the cron trigger.
- Configure your cron platform to call `GET /api/cron/scheduler` once daily with the secret.
- A good cron schedule is daily at 8:00 AM Asia/Muscat time (`0 4 * * *` UTC, accounting for +04:00 offset).

### Post-Deployment Verification

After deployment, verify by running the endpoint manually once with `CRON_SECRET` and checking the messages history page. Confirm that:
- Renewal reminders appear for customers whose policies expire according to the configured stages.
- Birthday greetings appear for customers with today's birthday (Asia/Muscat local date).
- No duplicate messages were created if the endpoint was called multiple times.

---

## Build

```bash
npm run build
```

Compiles clean. Run this before pushing to verify no errors.

---

## Test

```bash
npm test
```

Uses vitest. **185 tests across 12 files:**

| File | Tests | Coverage |
|------|-------|----------|
| `validation.test.ts` | 19 | Excel upload parser — row limits, column validation, error reporting |
| `messages-actions.test.ts` | 19 | Renewal preview/confirm, pagination & filters, Load More edge cases, "all" bypass, birthday preview/confirm, role rejection |
| `broadcast-actions.test.ts` | 20 | Validation, role rejection, server-side eligible-only guard, send success, mock detect, role-gated template loading, permission enforcement |
| `staff-actions.test.ts` | 12 | inviteStaff / deactivateStaff / activateStaff — revokeStaffPermission (8) + getCompanyStaffGrants (1) |
| `templates-actions.test.ts` | 13 | saveTemplate / resetTemplate with permission enforcement (staff grant checks) |
| `settings-actions.test.ts` | 12 | saveSettings / resetSettings with permission enforcement (staff grant checks) |
| `opt-outs-actions.test.ts` | 2 | addOptOut / removeOptOut — non-admin rejection |
| `upload-actions.test.ts` | 7 | parseExcel/deleteImport role rejection + confirmImport: role, happy path, duplicate, opt-out, invalid row |
| `scheduler.test.ts` | 16 | No companies, exact-stage matching, stage isolation, birthdays, cross-day dedup, same-day dedup, opted-out exclusion, missing templates, inactive settings, multi-company, API route auth |
| `super-admin-actions.test.ts` | 8 | Super admin create/toggle company with role rejection |
| `super-admin-dashboard.test.ts` | 5 | Dashboard data function with role rejection and PII-free data shape |
| `permissions.test.ts` | 45 | `can()` helper, permission request/approve/reject workflow, role enforcement |

---

## Safety Rules

> **Do not send test or real WhatsApp messages unless explicitly approved by the user.**
> All credentials are stored in `.env.local` — never hardcode or commit them.
> Validate all user inputs.
> Check user permissions before showing or changing data.
> Do not expose API keys, passwords, or tokens in frontend code.

---

## Basic Verification Checklist

- [ ] Login page loads and authentication works
- [ ] Upload an Excel file with valid and invalid rows — errors are shown clearly
- [ ] Dashboard shows correct counts and upcoming items
- [ ] Customer list displays records with search and filter
- [ ] Message templates can be edited and saved
- [ ] Send a test message to a sandbox-approved number — check history
- [ ] Broadcast flow: compose audience, preview, confirm
- [ ] Message history shows expandable details and filters work
- [ ] Responsive sidebar works on mobile viewport
- [ ] Opted-out numbers do not receive messages

---

## Production Readiness

### Done
- [x] Super Admin platform dashboard with aggregate metrics
- [x] Server-side role checks for all admin actions
- [x] `.env.example` with documented variables and placeholders
- [x] `docs/deployment.md` — full deployment and rollback checklist
- [x] README updated with current test count (185), correct env vars, and production instructions
- [x] All 185 tests passing, build clean

### Remaining before production
- [ ] **Twilio WABA production number** — requires Meta business verification, WABA approval, and template pre-approval
- [ ] **Scheduler real provider call** — current scheduler marks messages as "sent" without calling WhatsApp
- [ ] **UI-level polish** — consider empty states, loading skeletons, error boundaries
- [ ] **Monitoring** — add error tracking (Sentry, etc.) and uptime monitoring
- [ ] **Disable MOCK_MODE** — remove `MOCK_MODE=true` when real WhatsApp provider is configured and tested

> **Important:** Do not enable the cron job on production data until the WhatsApp provider call is implemented (see `docs/deployment.md` §5).

---

## Current Roadmap

1. **Testing: largely complete** — 185 tests across 12 files covering all flows plus role rejection, permission enforcement, and super admin dashboard.
2. **Scheduler MVP: complete** — Cron endpoint for renewal reminders and birthday greetings (Asia/Muscat timezone, exact-stage matching, dedupe, opted-out exclusion). Messages inserted as `status="sent"` — no real WhatsApp provider call yet.
3. **Permission system: complete** — Staff can request permissions, admin approves/revokes, server enforcement, UI reflection. See `docs/permissions-ADR.md`.
4. **Design unification: complete** — Button unification, spacing/table/text polish, card elevation, alert/dialog tokens. See `docs/checkpoint-2026-06-27-stable-mock-broadcast.md`.
5. **Broadcast production fixes: complete** — Stuck send fix, Server Components render crash fix, safe patterns. See checkpoint doc.
6. **Mock WhatsApp mode: complete** — `MOCK_MODE=true` enables sandbox sending (MVP/testing only). No real messages sent.
7. **Scheduler real provider integration** — Replace mock "sent" status with actual WhatsApp API call per message.
8. **Production WhatsApp/WABA** — Remains postponed. Requires Meta BSP, business verification, WABA approval, and template pre-approval.

---

## Project Links

- [`MY SaaS 2.MD`](./MY%20SaaS%202.MD) — Continuation and status document
- [`AGENTS.md`](./AGENTS.md) — Project instructions and coding rules
- [`docs/PRD.md`](./docs/PRD.md) — Product requirements document
