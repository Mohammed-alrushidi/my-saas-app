-- 00005: Reminder Settings

create table if not exists public.reminder_settings (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  reminder_days integer[] not null default '{30,14,7}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;

drop policy if exists "company_admin_select_reminder_settings" on public.reminder_settings;
create policy "company_admin_select_reminder_settings"
  on public.reminder_settings for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists "company_admin_insert_reminder_settings" on public.reminder_settings;
create policy "company_admin_insert_reminder_settings"
  on public.reminder_settings for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop policy if exists "company_admin_update_reminder_settings" on public.reminder_settings;
create policy "company_admin_update_reminder_settings"
  on public.reminder_settings for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop trigger if exists reminder_settings_updated_at on public.reminder_settings;
create trigger reminder_settings_updated_at
  before update on public.reminder_settings
  for each row execute function public.update_updated_at();

-- ==============================
-- SEED DEFAULT REMINDER SETTINGS
-- ==============================
create or replace function public.seed_default_reminder_settings(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reminder_settings (company_id, reminder_days, is_active)
  values (p_company_id, '{30,14,7}', true)
  on conflict (company_id) do nothing;
end;
$$;

create or replace function public.handle_new_company_reminder_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_reminder_settings(new.id);
  return new;
end;
$$;

drop trigger if exists on_company_created_seed_reminder_settings on public.companies;
create trigger on_company_created_seed_reminder_settings
  after insert on public.companies
  for each row execute function public.handle_new_company_reminder_settings();

-- Seed for existing companies
do $$
declare
  rec record;
begin
  for rec in select id from public.companies loop
    perform public.seed_default_reminder_settings(rec.id);
  end loop;
end;
$$;
