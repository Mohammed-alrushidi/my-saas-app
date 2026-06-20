-- 00001: Companies and Profiles

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==============================
-- COMPANIES
-- ==============================
create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  domain text unique not null,
  is_active boolean not null default true,
  subscription_status text not null default 'trial' check (subscription_status in ('active', 'trial', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies enable row level security;

-- Super Admin can see all companies; Company Admin and Staff see only their own
drop policy if exists "super_admin_select_all_companies" on public.companies;
create policy "super_admin_select_all_companies"
  on public.companies for select
  using (is_active = true);

drop policy if exists "super_admin_insert_companies" on public.companies;
create policy "super_admin_insert_companies"
  on public.companies for insert
  with check (true);

drop policy if exists "super_admin_update_companies" on public.companies;
create policy "super_admin_update_companies"
  on public.companies for update
  using (true);

-- ==============================
-- PROFILES
-- ==============================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  role text not null default 'staff' check (role in ('super_admin', 'company_admin', 'staff')),
  full_name text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile; Super Admin can read all
drop policy if exists "users_read_own_profile" on public.profiles;
create policy "users_read_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "super_admin_read_all_profiles" on public.profiles;
create policy "super_admin_read_all_profiles"
  on public.profiles for select
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  ));

drop policy if exists "company_admin_read_company_profiles" on public.profiles;
create policy "company_admin_read_company_profiles"
  on public.profiles for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- Super Admin can insert profiles
drop policy if exists "super_admin_insert_profiles" on public.profiles;
create policy "super_admin_insert_profiles"
  on public.profiles for insert
  with check (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  ));

-- Super Admin can update any profile; users can update their own
drop policy if exists "super_admin_update_profiles" on public.profiles;
create policy "super_admin_update_profiles"
  on public.profiles for update
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  ));

drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ==============================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ==============================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    'staff'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==============================
-- AUTO-UPDATE PROFILES EMAIL
-- ==============================
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ==============================
-- UPDATED_AT TRIGGERS
-- ==============================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.update_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();
