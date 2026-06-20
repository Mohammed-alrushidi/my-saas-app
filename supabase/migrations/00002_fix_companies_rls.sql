-- 00002: Fix Companies RLS policies
-- Drop existing policies that allow any authenticated user to access companies
-- Recreate with proper super_admin role checks

-- Drop the broken policies
drop policy if exists "super_admin_select_all_companies" on public.companies;
drop policy if exists "super_admin_insert_companies" on public.companies;
drop policy if exists "super_admin_update_companies" on public.companies;

-- Recreate with correct role-based checks

drop policy if exists "super_admin_select_companies" on public.companies;
create policy "super_admin_select_companies"
  on public.companies for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

drop policy if exists "super_admin_insert_companies" on public.companies;
create policy "super_admin_insert_companies"
  on public.companies for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

drop policy if exists "super_admin_update_companies" on public.companies;
create policy "super_admin_update_companies"
  on public.companies for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- Add delete policy for completeness (Super Admin only)
drop policy if exists "super_admin_delete_companies" on public.companies;
create policy "super_admin_delete_companies"
  on public.companies for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );
