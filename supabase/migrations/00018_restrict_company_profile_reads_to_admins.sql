-- 00018: Restrict company-wide profile reads to company admins
--
-- A user's own profile remains readable through users_read_own_profile, and
-- super admins retain their separate all-profile policy. This policy only
-- grants company-wide visibility when the caller is a company admin in the
-- same tenant as the target profile.

drop policy if exists "company_admin_read_company_profiles" on public.profiles;
create policy "company_admin_read_company_profiles"
  on public.profiles for select
  using (
    public.current_user_role() = 'company_admin'
    and company_id = public.current_company_id()
  );
