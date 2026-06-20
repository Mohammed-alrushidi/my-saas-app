---
name: ai-workflow
description: Use this skill for AI-assisted coding workflow discipline: clarify before planning, keep work as small vertical slices, avoid scope creep, preserve architecture, test carefully, and report results clearly. Use when implementing features, refactoring, debugging, planning, or reviewing code in this project.
---

# AI Workflow Strategy

Use this workflow when working on this codebase.

## Core principle

Do not treat the AI as a specs-to-code machine.

The codebase is the source of truth. Before changing code, inspect the relevant files, follow existing patterns, and keep the change small.

## 1. Start with alignment

Before implementing, clarify the task enough to avoid wrong assumptions.

If the request is vague, ask focused questions or state assumptions.

For risky areas, pause and ask before editing:
- auth
- RLS
- database schema
- message sending
- WhatsApp provider logic
- multi-tenant company isolation
- permissions

## 2. Keep work inside a small vertical slice

Prefer one small end-to-end change instead of a large multi-feature change.

A good vertical slice may touch:
- one server action
- one page/component
- focused tests
- documentation only if necessary

Avoid horizontal work where all database/API/UI changes are done separately without a testable result.

## 3. Do not expand scope

Respect explicit limits.

If the task says not to:
- change database schema
- add packages
- redesign the page
- change sending logic
- change provider logic
- refactor unrelated files

then do not do it.

If you notice useful improvements outside scope, list them as follow-up suggestions.

## 4. Preserve architecture

Prefer extending existing modules over creating scattered logic.

Use clear module boundaries:
- server actions for server-side behavior
- validation helpers for validation rules
- page/component code for UI behavior only
- tests around important behavior

Do not rewrite working modules unless explicitly asked.

## 5. Prefer deep modules

Keep interfaces simple and behavior contained.

Good:
- add one clear function with focused responsibility
- test that function through realistic behavior

Bad:
- split one small behavior into many tiny files
- duplicate business logic in UI and server
- create helpers before they are needed

## 6. Testing is the feedback loop

For implementation tasks, add or update focused tests when practical.

Prefer testing:
- role and permission gates
- company/tenant isolation
- query behavior
- pagination
- search
- invalid data
- opted-out cases
- happy path
- important edge cases

Always run the relevant verification commands.

For this project, default verification:
```bash
npm test
npm run build