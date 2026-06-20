# Deployment Checklist

## Prerequisites

Before deploying, ensure you have:

- [ ] **Vercel account** connected to the Git repository
- [ ] **Supabase project** (production or staging) with migrations applied
- [ ] **Twilio account** with WhatsApp sandbox enabled (or production WABA approved)

---

## 1. Environment Variables

Set all of the following in your hosting environment (Vercel Dashboard → Project → Settings → Environment Variables):

### Supabase
| Variable | Where to get it | Notes |
|----------|----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API | Public, safe in browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Project Settings → API | Public, safe in browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API | **Server-only secret** — never expose to browser |

### Twilio
| Variable | Where to get it | Notes |
|----------|----------------|-------|
| `TWILIO_ACCOUNT_SID` | Twilio Console | **Server-only secret** |
| `TWILIO_AUTH_TOKEN` | Twilio Console | **Server-only secret** |
| `TWILIO_WHATSAPP_NUMBER` | Twilio Console → WhatsApp → Senders | Sandbox: `+14155238886` |

### Site URL
| Variable | Purpose | Example |
|----------|---------|---------|
| `SITE_URL` | Server-side — Twilio delivery status callbacks | `https://your-app.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | Client + server — password reset redirect URL | `https://your-app.vercel.app` |

### Cron
| Variable | How to generate |
|----------|----------------|
| `CRON_SECRET` | `openssl rand -hex 32` — protects the scheduler endpoint |

---

## 2. Supabase Setup Checklist

- [ ] **Run all SQL migrations** from `supabase/migrations/` via Supabase Dashboard SQL Editor or CLI
- [ ] **Enable Email + Password authentication** in Supabase Auth → Providers
- [ ] **Verify RLS policies** are active on all tables (companies, profiles, customer_records, messages, etc.)
- [ ] **Create the first super_admin user**: create a user in Auth → Users, then insert a profile row with `role = 'super_admin'`
- [ ] **Create the first company** via the Super Admin Companies page at `/super-admin/companies`
- [ ] **Verify company isolation**: log in as a company_admin and confirm you cannot see other companies' data

---

## 3. Vercel Deployment Checklist

- [ ] **Connect Git repository** in Vercel Dashboard
- [ ] **Framework preset**: Next.js (auto-detected)
- [ ] **Root directory**: `./my-saas-app` (if using a monorepo) or `./`
- [ ] **Build command**: `npm run build`
- [ ] **Output directory**: `.next` (default)
- [ ] **Set all environment variables** (see Section 1 above)
- [ ] **Deploy** and wait for the build to complete
- [ ] **Verify deployment**: visit the production URL, confirm login page loads
- [ ] **Configure custom domain** (optional): add domain in Vercel Dashboard → Domains

---

## 4. Vercel Cron Checklist

The `vercel.json` file configures a daily cron job:

```json
{
  "crons": [
    {
      "path": "/api/cron/scheduler",
      "schedule": "0 4 * * *"
    }
  ]
}
```

- [ ] **`CRON_SECRET` is set** in Vercel environment variables (required — the endpoint returns 500 without it)
- [ ] **Cron schedule** fires at 04:00 UTC (08:00 AM Asia/Muscat) — can be adjusted in `vercel.json`
- [ ] **Verify cron fires**: after deployment, check Vercel Dashboard → Cron Jobs tab for invocation history
- [ ] **Test manually once**: call `GET /api/cron/scheduler` with header `x-cron-secret: YOUR_SECRET` to verify

---

## 5. CRON_SECRET Safety Warning

> **Do not run the cron endpoint with a real CRON_SECRET on production data until the WhatsApp provider is connected and tested.**

The scheduler currently inserts messages with `status = "sent"` but **does not actually call the WhatsApp provider**. This means:
- Messages appear as "sent" in message history
- No WhatsApp message is delivered to the customer
- Running the scheduler on real production data would create false "sent" records

Only enable the cron job after:
1. The WhatsApp provider call is integrated into the scheduler
2. You have tested with a sandbox number
3. You have confirmed end-to-end delivery

---

## 6. Manual QA Checklist

Before pointing real users at the deployment, verify each flow:

### Authentication & Roles
- [ ] Login page loads and authentication works
- [ ] Super admin is redirected to the super admin area
- [ ] Company admin is redirected to the company dashboard
- [ ] Staff user has correct limited access

### Super Admin
- [ ] Platform dashboard at `/super-admin/dashboard` shows aggregate metrics
- [ ] Companies page at `/super-admin/companies` lists all companies
- [ ] Can create a new company with admin user
- [ ] Can activate/deactivate a company
- [ ] Can navigate between Dashboard and Companies via sidebar

### Company Admin
- [ ] Dashboard shows correct counts and upcoming items
- [ ] Upload Excel with valid and invalid rows — errors shown clearly
- [ ] Customer list displays records with search and filter
- [ ] Upcoming expiries view works (30/14/7 day filters)
- [ ] Birthdays view shows this month and today
- [ ] Message templates can be edited and saved
- [ ] Send a test message to a sandbox-approved WhatsApp number
- [ ] Message history shows sent/failed messages with expandable details
- [ ] Broadcast flow: compose, preview, confirm
- [ ] Staff management: invite, deactivate, activate
- [ ] Settings: configure reminder days, enable/disable reminders
- [ ] Opt-out list displays opted-out numbers

### Staff
- [ ] Dashboard is read-only
- [ ] Upload Excel is hidden (if staff is not permitted)
- [ ] Customer records are view-only
- [ ] Expiries and birthdays are view-only
- [ ] Staff management is hidden
- [ ] Settings are hidden
- [ ] Broadcast is hidden

### General
- [ ] Responsive sidebar works on mobile viewport
- [ ] Opted-out numbers do not receive messages
- [ ] All sidebar navigation items link to correct pages
- [ ] Logout works on all pages

---

## 7. Twilio / WABA Production Blocker

This project currently uses the **Twilio WhatsApp Sandbox** for development.

**Known limitations of the sandbox:**
- Recipients must send a WhatsApp opt-in message to the sandbox number first
- Sandbox sessions expire after 72 hours of inactivity (7 days with activity)
- Works with only a handful of test numbers
- Messages include "Sent from a Twilio Sandbox" prefix

**To go to production, you need:**
1. A **Meta Business Solution Provider (BSP)** — e.g., Twilio's WABA onboarding
2. **Business verification** with Meta (can take weeks)
3. **WABA approval** from Meta
4. **Pre-approved message templates** for each message type (renewal, birthday, broadcast)
5. Update `TWILIO_WHATSAPP_NUMBER` to your production WABA number

**Status:** Production WABA is **postponed** until the above steps are completed.

---

## 8. Rollback / Backup Plan

### Before deploying a new version
- [ ] **Supabase: take a database snapshot** — Supabase Dashboard → Database → Backups or pg_dump
- [ ] **Vercel: enable Production Deploy Holds** — Vercel Dashboard → Project → Git → Deploy Hooks
- [ ] **Document the current commit** — note the commit hash you are deploying from

### If a deployment breaks
**Vercel rollback:**
1. Go to Vercel Dashboard → Project → Deployments
2. Find the last known-good deployment
3. Click the three-dot menu → "Promote to Production"

**Database rollback:**
1. Restore from the Supabase snapshot taken before the migration
2. Or re-run the previous migration state via Supabase CLI

### If the cron job malfunctions
1. Disable the cron schedule in `vercel.json` and redeploy
2. Or set `CRON_SECRET` to an empty/invalid value to block the endpoint
3. Message records can be cleaned up via Supabase Dashboard SQL Editor if needed
