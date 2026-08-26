-- 00014: Company visibility for company users (tenant-scoped)
--
-- Migration 00002 restricted companies SELECT to super_admin only. Company
-- admins and staff could not read even their OWN company row, so the
-- profiles -> companies embed in getProfile() returned null for every
-- company user. Consequences in production:
--   - {{company_name}} rendered as an empty string in manually sent
--     renewal, birthday, and broadcast WhatsApp messages
--   - the dashboard sidebar never showed the company name
--
-- This policy restores read access to the caller's own company row only,
-- using the same tenant-scoping pattern as every other company table
-- (see customer_records / imports / reminder_settings policies).
-- INSERT / UPDATE / DELETE remain super_admin-only.

drop policy if exists "company_select_own_company" on public.companies;

create policy "company_select_own_company"
  on public.companies for select
  using (
    id = (select company_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('company_admin', 'staff')
    )
  );
