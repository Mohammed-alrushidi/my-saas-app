-- 00011: Permission Requests and Staff Permission Grants

-- ==============================
-- PERMISSION REQUESTS
-- ==============================
create table if not exists public.permission_requests (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  permission    text not null check (permission in (
    'templates:edit',
    'reminder_settings:edit',
    'broadcast:create'
  )),
  reason        text not null check (char_length(reason) between 10 and 500),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text check (review_note is null or char_length(review_note) <= 500),
  created_at    timestamptz not null default now()
);

alter table public.permission_requests enable row level security;

-- Staff can insert their own requests
drop policy if exists "staff_insert_own_requests" on public.permission_requests;
create policy "staff_insert_own_requests"
  on public.permission_requests for insert
  with check (
    auth.uid() = staff_id
    and company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Staff can read their own requests
drop policy if exists "staff_read_own_requests" on public.permission_requests;
create policy "staff_read_own_requests"
  on public.permission_requests for select
  using (auth.uid() = staff_id);

-- Company admin can read requests for their company
drop policy if exists "admin_read_company_requests" on public.permission_requests;
create policy "admin_read_company_requests"
  on public.permission_requests for select
  using (company_id = (select company_id from public.profiles where id = auth.uid() and role = 'company_admin'));

-- Company admin can update (approve/reject) requests for their company
drop policy if exists "admin_update_company_requests" on public.permission_requests;
create policy "admin_update_company_requests"
  on public.permission_requests for update
  using (company_id = (select company_id from public.profiles where id = auth.uid() and role = 'company_admin'));

-- Indexes
create index if not exists idx_pr_company on public.permission_requests (company_id);
create index if not exists idx_pr_staff on public.permission_requests (staff_id);
create index if not exists idx_pr_status on public.permission_requests (status);

-- Prevent duplicate pending requests from same staff + permission + company
create unique index if not exists idx_pr_pending_unique
  on public.permission_requests (company_id, staff_id, permission)
  where status = 'pending';

-- ==============================
-- STAFF PERMISSION GRANTS
-- ==============================
create table if not exists public.staff_permission_grants (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  permission    text not null check (permission in (
    'templates:edit',
    'reminder_settings:edit',
    'broadcast:create'
  )),
  granted_by    uuid references public.profiles(id) on delete set null,
  granted_at    timestamptz not null default now(),
  revoked_by    uuid references public.profiles(id) on delete set null,
  revoked_at    timestamptz,
  is_active     boolean not null default true
);

alter table public.staff_permission_grants enable row level security;

-- Staff can read their own active grants
drop policy if exists "staff_read_own_grants" on public.staff_permission_grants;
create policy "staff_read_own_grants"
  on public.staff_permission_grants for select
  using (auth.uid() = staff_id and is_active = true);

-- Company admin can read grants for their company
drop policy if exists "admin_read_company_grants" on public.staff_permission_grants;
create policy "admin_read_company_grants"
  on public.staff_permission_grants for select
  using (company_id = (select company_id from public.profiles where id = auth.uid() and role = 'company_admin'));

-- Company admin can grant permissions
drop policy if exists "admin_insert_grant" on public.staff_permission_grants;
create policy "admin_insert_grant"
  on public.staff_permission_grants for insert
  with check (company_id = (select company_id from public.profiles where id = auth.uid() and role = 'company_admin'));

-- Company admin can revoke grants (set is_active = false)
drop policy if exists "admin_revoke_grant" on public.staff_permission_grants;
create policy "admin_revoke_grant"
  on public.staff_permission_grants for update
  using (company_id = (select company_id from public.profiles where id = auth.uid() and role = 'company_admin'))
  with check (
    is_active = false
    and revoked_by is not null
    and revoked_at is not null
  );

-- Indexes
create index if not exists idx_spg_company on public.staff_permission_grants (company_id);
create index if not exists idx_spg_staff on public.staff_permission_grants (staff_id);
create index if not exists idx_spg_permission on public.staff_permission_grants (permission);

-- One active grant per staff + permission + company
create unique index if not exists idx_spg_active_unique
  on public.staff_permission_grants (company_id, staff_id, permission)
  where is_active = true;
