-- 00016: Reconcile production-only RLS recursion helpers
--
-- Production contains these helper functions and policy rewrites, but they were
-- created outside the repository migration history. This migration makes that
-- already-deployed state reproducible for fresh environments. It is deliberately
-- limited to functions, grants, and policies: no table shape or customer data is
-- changed.

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.profile_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
  );
$$;

-- Preserve the grants observed in production. Each helper only returns data
-- derived from the caller's auth.uid(); it cannot accept a target user id.
grant execute on function public.current_company_id() to public, anon, authenticated, service_role;
grant execute on function public.current_user_role() to public, anon, authenticated, service_role;
grant execute on function public.is_super_admin() to public, anon, authenticated, service_role;
grant execute on function public.profile_exists() to public, anon, authenticated, service_role;

-- Avoid recursive reads of public.profiles while evaluating policies on
-- companies and profiles.
drop policy if exists "super_admin_select_companies" on public.companies;
create policy "super_admin_select_companies"
  on public.companies for select
  using (public.is_super_admin());

drop policy if exists "super_admin_insert_companies" on public.companies;
create policy "super_admin_insert_companies"
  on public.companies for insert
  with check (public.is_super_admin());

drop policy if exists "super_admin_update_companies" on public.companies;
create policy "super_admin_update_companies"
  on public.companies for update
  using (public.is_super_admin());

drop policy if exists "super_admin_delete_companies" on public.companies;
create policy "super_admin_delete_companies"
  on public.companies for delete
  using (public.is_super_admin());

drop policy if exists "super_admin_read_all_profiles" on public.profiles;
create policy "super_admin_read_all_profiles"
  on public.profiles for select
  using (public.is_super_admin());

drop policy if exists "company_admin_read_company_profiles" on public.profiles;
create policy "company_admin_read_company_profiles"
  on public.profiles for select
  using (company_id = public.current_company_id());

drop policy if exists "super_admin_insert_profiles" on public.profiles;
create policy "super_admin_insert_profiles"
  on public.profiles for insert
  with check (public.is_super_admin());

drop policy if exists "super_admin_update_profiles" on public.profiles;
create policy "super_admin_update_profiles"
  on public.profiles for update
  using (public.is_super_admin());

drop policy if exists "super_admin_select_customer_records" on public.customer_records;
create policy "super_admin_select_customer_records"
  on public.customer_records for select
  using (public.is_super_admin());

drop policy if exists "super_admin_select_templates" on public.message_templates;
create policy "super_admin_select_templates"
  on public.message_templates for select
  using (public.is_super_admin());
