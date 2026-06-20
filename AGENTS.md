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
