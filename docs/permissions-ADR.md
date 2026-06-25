# ADR-001: Permission System Architecture

## Context

A multi-tenant insurance reminder SaaS with three roles (`super_admin`, `company_admin`, `staff`) needs a flexible permission system. Staff users need granular, revocable access to specific features (template editing, settings editing, broadcast creation) without granting full admin privileges.

Requirements:
- Staff can request specific permissions
- Company admin can approve, reject, or revoke those permissions
- Permission checks are enforced server-side (defense-in-depth)
- The UI reflects what the current user can do
- The system must be auditable (who granted/revoked what, when)

## Decision

Use a **two-table model** with a helper function for permission checks:

1. `permission_requests` — tracks requests from staff to company admin
2. `staff_permission_grants` — records approved (and later revoked) active grants

Access is gated by the `can(profile, permission)` helper function.

## Why Two Tables

### Why not JSON permissions on `profiles`

Storing permissions as a JSON column on the `profiles` table would be simpler but has drawbacks:
- No audit trail for grants and revocations
- Harder to query (who has `templates:edit`?)
- Race conditions when admin approves while staff edits
- No natural place for request/review workflow metadata
- RLS policies on JSON columns are more error-prone

### Why not one combined table

Combining requests and grants into a single table would mix transient workflow state (pending/rejected/reviewed_by) with active grant state (is_active/revoked_by/revoked_at). This makes RLS policies more complex and queries harder to reason about.

### Two-table benefits

- `permission_requests` handles the request-review lifecycle (pending → approved/rejected)
- `staff_permission_grants` handles the grant lifecycle (active → revoked)
- Clean RLS: each table has focused policies
- Scalable: adding new permission types requires no schema changes (just appending to the `permission` check constraint)
- Auditable: `granted_by`, `revoked_by`, `granted_at`, `revoked_at` are first-class columns

## `can(profile, permission)` Helper Pattern

A single function (`src/lib/supabase/permissions.ts`) that:
- Accepts a `ProfileLike` object and a `CompanyPermission` string
- `company_admin` → returns `true` immediately (no DB query)
- `super_admin` → returns `false` (company-scoped permissions don't apply)
- `staff` → queries `staff_permission_grants` for an active (`is_active = true`) matching row via `maybeSingle`
- Unknown permission strings → returns `false` (strict gate)

This function is used in server actions as a single-line guard:

```typescript
if (!can(profile, "templates:edit")) return { error: "Permission denied" }
```

## `getDashboardCapabilities()` as UI Capability Source

For UI-level permission checks (showing/hiding UI elements), we use `getDashboardCapabilities()` in `src/app/dashboard/role-actions.ts`. This makes three parallel `can()` calls and returns a capabilities object:

```typescript
{
  role: string
  canEditTemplates: boolean
  canEditSettings: boolean
  canPrepareBroadcast: boolean
  canSendBroadcast: boolean
}
```

This prevents N+1 queries on page load and provides a single source of truth for UI rendering decisions.

## Broadcast Security Split

Broadcast functionality has two tiers:
- **`broadcast:create`** — allows staff to prepare a broadcast (select recipients, compose message, preview). Server actions for template loading and recipient listing are gated by `can(profile, "broadcast:create")`.
- **Final send/confirm** — restricted to `company_admin` only via a hard-coded role check (`profile.role !== "company_admin"`). This is intentional: sending messages to potentially thousands of customers is a high-risk operation that requires full admin authority.

## RLS Overview

Six RLS policies protect the two tables:

**`permission_requests`:**
- Staff can insert their own requests
- Staff can read their own requests
- Company admin can read all requests for their company
- Company admin can update (approve/reject) requests for their company

**`staff_permission_grants`:**
- Company admin can read grants for their company (used by `can()` and `getCompanyStaffGrants()`)
- Company admin can revoke grants in their company (update `is_active`, `revoked_by`, `revoked_at`)

An additional unique index (`idx_spg_active_unique`) prevents duplicate active grants per (company, staff, permission).

## Revocation Model

Revocation is a soft-delete on the grant:
- `is_active = false`
- `revoked_by = admin.id`
- `revoked_at = now()`

The `can()` function filters by `is_active = true`, so revoked grants immediately stop working.

The `getCompanyStaffGrants()` query also filters by `is_active = true`, so revoked grants don't appear in the UI.

## Consequences / Tradeoffs

**Positive:**
- Strong audit trail for all permission changes
- No schema changes for new permission types
- Clear separation of request workflow and grant lifecycle
- Server-side enforcement with UI reflection
- Revocation is immediate and auditable

**Negative:**
- Two queries for a permission check (profile fetch + grant check) — acceptable for server actions, mitigated by `getProfile()` batching
- `getDashboardCapabilities()` makes 3 parallel DB queries — acceptable for page load (sub-100ms)
- No built-in permission expiry — grants live until revoked
- Staff cannot see their own active grants in the UI (only their request history)

## Future Improvements

- **Permission expiry** — add `expires_at` column to `staff_permission_grants` for time-limited grants
- **Email notifications** — notify staff when permission is approved, rejected, or revoked
- **E2E tests** — add Playwright or Cypress tests covering the full permission request→approve→use→revoke workflow
- **Audit log** — add a dedicated audit table or leverage existing columns for compliance reporting
- **Super admin impersonation** — design a mechanism for super_admin to temporarily act as company_admin for support scenarios
