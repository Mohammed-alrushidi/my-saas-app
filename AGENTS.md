<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Instructions

## Project Type
This is a SaaS application.

## Main Rule
Always plan before coding.

## Workflow
For every new feature:
1. Use Grill Me if requirements are unclear.
2. Create or update the PRD.
3. Break the work into vertical slices.
4. Implement only one slice at a time.
5. Review the code in a clean context.
6. Summarize changes and risks.

## Smart Zone Rule
Avoid long conversations for implementation.
If the context becomes too long, stop and ask to continue in a fresh context.

## SaaS Rules
Every feature must consider:
- authentication
- authorization
- user roles
- subscription limits
- database design
- security
- validation
- error handling
- mobile responsiveness

## Coding Rules
- Keep code simple and maintainable.
- Do not create unnecessary files.
- Do not add libraries without explaining why.
- Do not delete existing features unless asked.
- Use TypeScript where possible.
- Prefer clear names and readable code.
- Prefer deep modules over many shallow files.

## Database Rules
- Explain database changes before making them.
- Avoid duplicate tables.
- Do not delete data or migrations unless asked.
- Keep table relationships clear.

## Security Rules
- Validate all user inputs.
- Protect private pages and API routes.
- Check user permissions before showing or changing data.
- Never expose API keys or secret keys.
- Never put passwords or tokens in frontend code.

## UI Rules
- Use reusable components.
- Keep the interface clean and professional.
- Make pages responsive for mobile and desktop.

## Review Rules
After implementation:
- summarize changed files
- mention risks
- mention what should be tested manually
- suggest the next slice


<!-- BEGIN:hermes-operating-rules -->
# Hermes Operating Rules

## Roles
- Mohammed is the final decision maker.
- Hermes is the orchestrator and project operations manager.
- OpenCode is the coding worker.
- Git and GitHub are the source of truth for repository state.

## Work Modes

### Plan Mode
- Planning is read-only by default.
- Inspect the repository, understand the task, identify risks, and propose the smallest safe slice.
- Do not edit project files.
- Do not create commits.
- Do not push, merge, or deploy.
- Completing a plan does not authorize implementation.

### Execution Mode
- Enter execution mode only after explicit Mohammed approval.
- Implement only the approved scope.
- Use a dedicated branch. Never implement directly on `main`.
- If the task requires expanding scope or touching additional files, stop, report why, and wait for approval.

## Risk-Based Approval
Approval gates must scale with risk.

### Low Risk
Examples: small UI fixes, isolated lint fixes, tests, documentation, and focused changes to a few files.

One approval may cover:
- implementation
- verification
- local commit

Push and PR remain separate unless explicitly included in the approval.

### Medium Risk
Examples: multi-file features, business logic, imports, messaging logic, and automation.

Require:
- a clear plan
- implementation approval
- verification
- spec review
- code quality review

Local commit may be included in implementation approval. Push and PR remain separate unless explicitly approved.

### High Risk
Examples:
- authentication
- authorization
- Supabase RLS
- database schema or migrations
- secrets or credentials
- production data
- infrastructure
- deployment

Require separate, explicit approvals as appropriate for:
- implementation
- push
- merge
- deploy

Do not assume approval of one stage authorizes later stages.

## Protected Areas
- Never modify `.env` files unless explicitly approved.
- Never expose, rotate, copy, or print secrets or credentials.
- Do not change Supabase RLS without explicit high-risk review and approval.
- Do not change production data or infrastructure without explicit approval.
- Automatic preview deployments triggered by an approved PR are allowed for review and testing.
- Production deployment always requires explicit Mohammed approval.
- Do not run destructive commands unless explicitly approved.
- Do not delete unrelated files, data, migrations, branches, or features.

## Git Safety
Before implementation, verify:
- current branch
- working tree status
- latest commit
- approved scope

After implementation, report:
- changed files
- diff summary
- targeted lint results
- test results
- build result
- remaining risks

Never hide unrelated changes or include them in the task.

## Scope Control
- Work only on the approved slice.
- Do not fix unrelated issues discovered during the task.
- If more files or a wider scope are required, stop and report before proceeding.

## Existing Lint Debt
- Distinguish pre-existing lint debt from new regressions.
- Do not treat known baseline lint failures as newly introduced failures.
- Do not fix unrelated lint issues unless they are part of the approved scope.

## Review Discipline
- Low-risk work may use a lightweight review.
- Medium-risk work should include spec compliance review and code quality review.
- High-risk work requires deeper review before push, merge, or deploy.
- A reviewer must check for out-of-scope changes.

## Speed Principle
Optimize for speed without removing safety:
- keep small tasks lightweight
- avoid unnecessary approval loops
- combine low-risk steps when explicitly approved
- increase safeguards only as risk increases
<!-- END:hermes-operating-rules -->
