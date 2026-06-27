# Checkpoint: Stable Mock Broadcast State — 2026-06-27

Current branch: `feat/mock-whatsapp` (commit `f79204e`)
Base branch: `main` (commit `6e2b7e7` — broadcast production fixes merged, mock WhatsApp not yet merged)

---

## Verified State

| Item | Status |
|---|---|
| Button unification complete | ✅ |
| Spacing/table/text polish (D1) | ✅ |
| Dashboard card elevation (D2A) | ✅ |
| Alert/dialog token polish (D2B) | ✅ |
| Remaining raw buttons | Intentional non-standard patterns only |
| Broadcast stuck send fix | ✅ |
| Broadcast Server Components render crash fix | ✅ |
| `revalidatePath("/dashboard/messages")` removed from broadcast send | ✅ |
| Layout/action safety guards added | ✅ |
| Mock WhatsApp (`MOCK_MODE=true`) | ✅ |
| Tests passing | 185 |
| Build clean | ✅ |
| Production broadcast test passed | ✅ |

---

## Completed Design Work

### Button Unification (7 commits)

All standard dashboard action buttons migrated from raw `<button>` to shadcn `Button` component. Verified by a final raw button audit — zero remaining raw buttons in dashboard action contexts.

| Commit | Scope |
|--------|-------|
| `d1bc371` | Templates buttons |
| `699ef78` | Low-risk dashboard buttons |
| `21576cd` | Batch B dashboard buttons |
| `8c6af2c` | Admin and sidebar buttons |
| `6920963` | Confirm dialog buttons |
| `57c1933` | Broadcast buttons |
| `c55d38c` | Messages action buttons |

### Spacing/Table/Text Polish (D1) — 1 commit

`f434465` — Unified page padding, table cell padding, and text color tokens across dashboard pages.

### Dashboard Card Elevation (D2A) — 1 commit

`a4cbd21` — Applied `shadow-sm` to content cards for subtle depth while keeping stat cards flat.

### Alert/Dialog Token Polish (D2B) — 1 commit

`1accbd7` — Polished alert banners and dialog tokens to use semantic background colors instead of hardcoded values.

---

## Broadcast Production Bug Fixes

Three issues were identified and resolved in production:

### 1. Stuck Send Button

**Cause:** The broadcast confirm server action threw an unhandled error, leaving the UI in a loading state.

**Fix (`3abcd43`):** Wrapped the action body in try/catch/finally. The button always resets regardless of success or failure.

### 2. Server Components Render Crash

**Cause:** After cookie-modifying server actions, Next.js 16 re-fetches the current layout. The dashboard layout called `getProfile()` without error handling, and if that call failed during the re-fetch, the entire layout crashed.

**Fixes:**
- `d7f1d9b` — Removed `revalidatePath("/dashboard/messages")` from broadcast send (the trigger for the re-fetch)
- `6e2b7e7` — Wrapped `getProfile()` in dashboard layout with try/catch; wrapped `confirmBroadcastSelected` body in try/catch

### 3. Missing Twilio Config Error

**Fix:** The mock provider (see below) now activates when `MOCK_MODE=true`, bypassing the Twilio credential check.

### Current State

- No Twilio missing config error
- No Server Components render error
- Button does not get stuck
- Broadcast success appears
- Messages appear in Message History

---

## Mock WhatsApp Mode

### Purpose

Allow MVP/testing use of the broadcast feature without a real Twilio WhatsApp provider. No real WhatsApp messages are sent.

### How It Works

1. Set `MOCK_MODE=true` in the environment (currently enabled in Vercel).
2. When `MOCK_MODE=true`, the provider factory returns a `MockWhatsAppProvider` that generates mock provider IDs (`mock-sid-*`) without any network call.
3. When `MOCK_MODE` is not true and Twilio credentials are missing, the original error is thrown (no silent fallback).
4. When `MOCK_MODE` is not true and Twilio credentials are present, the real `TwilioWhatsAppProvider` is used (unchanged).

### Detection in Broadcast

The broadcast server action (`confirmBroadcastSelected`) checks if any returned `providerMessageId` starts with `mock-`. If so, it sets `result.mock = true`.

### UI Notice

The broadcast page shows a yellow sandbox notice when `result.mock` is true:

> "Mock send only — no real WhatsApp message was sent."

### Important Caveat

This is **not** WhatsApp Production Readiness. Real WhatsApp message delivery requires:
- Twilio credentials configured
- `MOCK_MODE` disabled (or unset)
- A later production readiness phase

---

## Commit Reference

| Commit | Description |
|--------|-------------|
| `d1bc371` | feat: unify templates buttons with design system |
| `699ef78` | feat: unify low-risk dashboard buttons |
| `21576cd` | feat: unify batch b dashboard buttons |
| `8c6af2c` | feat: unify admin and sidebar buttons |
| `6920963` | feat: unify confirm dialog buttons |
| `57c1933` | feat: unify broadcast buttons |
| `c55d38c` | feat: unify messages action buttons |
| `f434465` | feat: polish dashboard spacing and tables |
| `a4cbd21` | feat: add dashboard card elevation |
| `1accbd7` | feat: polish alerts and dialog tokens |
| `3abcd43` | fix: prevent broadcast send from getting stuck |
| `d7f1d9b` | fix: avoid broadcast revalidation render crash |
| `6e2b7e7` | fix: prevent broadcast server render error (layout/action safety) |
| `f79204e` | feat: support mock whatsapp sending (on `feat/mock-whatsapp`) |

---

## Test & Build State

- **Tests:** 185 passing across 12 files
- **Build:** Compiles cleanly with Next.js 16.2.9 (Turbopack)

---

## Production State

- `MOCK_MODE=true` is enabled in Vercel for MVP/testing
- Production broadcast test verified:
  - No Twilio missing config error
  - No Server Components render error
  - Button does not get stuck
  - Broadcast success appears
  - Sandbox notice appears
  - Message appears in Message History
  - No real WhatsApp message sent

---

## Guardrails

- **Do not** enable real WhatsApp sending without a production readiness plan.
- **Do not** remove `MOCK_MODE=true` unless ready for real Twilio provider configuration.
- **Do not** reintroduce `revalidatePath("/dashboard/messages")` in broadcast send without thorough testing.
- **Do not** remove try/catch/finally guards from user-triggered server actions.
- **Do not** delete or modify this checkpoint without updating all referencing files (`CLAUDE.md`, `README.md`).
- **Continue** planning-first workflow for all new features.

---

## Next Recommended Steps

1. **D6 Empty States** — Plan and implement consistent empty state component across all pages (see `docs/design-system.md` §9).
2. **WhatsApp Production Readiness** — Real WABA provider, Twilio credentials, `MOCK_MODE` disabled. Requires careful plan.
3. **Design-system final sync** — Review `docs/design-system.md` against actual implementation; update any drift.
4. **Remaining design phases** — D2 typography, D5 sidebar refresh, D7 communication accent (as prioritised).
