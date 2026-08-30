-- 00017: Block profile self-service privilege escalation
--
-- The legacy users_update_own_profile policy allowed any authenticated user to
-- update every mutable column on their own profile, including role, company_id,
-- and is_active. Profile administration already uses either the dedicated
-- super-admin policy or the server-only service-role client, so no replacement
-- self-update policy is required by the current application.

drop policy if exists "users_update_own_profile" on public.profiles;
