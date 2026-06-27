@AGENTS.md

## Permission System — Completed Phases 1–5

### Phases

- **Phase 1:** Schema (`permission_requests` + `staff_permission_grants`), RLS, indexes, `can()` helper
- **Phase 2:** Staff permission request workflow
- **Phase 3:** Company admin approve/reject workflow
- **Phase 4A:** Server-side permission enforcement in 6 server actions
- **Phase 4B:** Permission-aware dashboard UI and sidebar
- **Phase 5A:** Revocation server actions (`revokeStaffPermission`, `getCompanyStaffGrants`)
- **Phase 5B:** Grant revocation UI on Staff Management page

### Migration

`00011_permission_requests.sql` — applied to Supabase Production.

### Tests

`184/184 passing` (12 test files)

### Production QA

Passed — all scenarios verified.

### Key Commits

- `1d9edde` feat: enforce staff permissions in server actions
- `6f8d65e` feat: show permission-aware dashboard UI
- `082cf41` feat: add staff permission revocation actions
- `f8d65d3` feat: add staff permission revocation UI

### Final Behavior

- Staff can request permissions
- Company admin can approve/reject requests
- Approved grants are enforced in server actions
- Dashboard UI and sidebar reflect granted permissions
- Staff with `broadcast:create` can prepare broadcasts but cannot send
- Company admin only can send broadcasts
- Company admin can revoke active grants from Staff Management
- Revoked permissions remove access after refresh

---

## Design Checkpoint — Complete (2026-06-27)

Button unification done (7 commits). Spacing/table/text polish done. Card elevation done. Alert/dialog tokens done. See `docs/checkpoint-2026-06-27-stable-mock-broadcast.md` for full details.

## Broadcast Fixes Checkpoint — Complete (2026-06-27)

3 production bugs fixed: stuck send (try/catch/finally), Server Components render crash (removed `revalidatePath`, added layout/action guards). See checkpoint doc.

## Mock WhatsApp Checkpoint — Complete (2026-06-27)

`MOCK_MODE=true` enables mock provider (no real messages sent). Mock IDs prefixed `mock-sid-`. Sandbox UI notice shown. Missing Twilio creds without `MOCK_MODE` still errors. See checkpoint doc for guardrails and next steps.
