-- 00004: Message Templates

create table if not exists public.message_templates (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_type text not null check (template_type in ('renewal', 'birthday', 'broadcast')),
  name text not null,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, template_type)
);

alter table public.message_templates enable row level security;

drop policy if exists "company_admin_select_templates" on public.message_templates;
create policy "company_admin_select_templates"
  on public.message_templates for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists "company_admin_insert_templates" on public.message_templates;
create policy "company_admin_insert_templates"
  on public.message_templates for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop policy if exists "company_admin_update_templates" on public.message_templates;
create policy "company_admin_update_templates"
  on public.message_templates for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop policy if exists "company_admin_delete_templates" on public.message_templates;
create policy "company_admin_delete_templates"
  on public.message_templates for delete
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop trigger if exists message_templates_updated_at on public.message_templates;
create trigger message_templates_updated_at
  before update on public.message_templates
  for each row execute function public.update_updated_at();

-- ==============================
-- SEED DEFAULT TEMPLATES
-- ==============================
create or replace function public.seed_default_templates(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.message_templates (company_id, template_type, name, body, is_default)
  values
    (p_company_id, 'renewal', 'Renewal Reminder',
      'Hello {{customer_name}}, your car insurance for {{veh_make_model}} will expire on {{policy_expiry_date}} ({{days_remaining}} days remaining). To renew your policy, please contact us.
Reply STOP to unsubscribe.',
      true),
    (p_company_id, 'birthday', 'Birthday Greeting',
      'Happy Birthday {{customer_name}}! We wish you a wonderful year ahead. Thank you for being our valued customer.
Reply STOP to unsubscribe.',
      true),
    (p_company_id, 'broadcast', 'Broadcast / Campaign',
      'Dear {{customer_name}}, this is a message from {{company_name}}.
Reply STOP to unsubscribe.',
      true)
  on conflict (company_id, template_type) do nothing;
end;
$$;

create or replace function public.handle_new_company_templates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_templates(new.id);
  return new;
end;
$$;

drop trigger if exists on_company_created_seed_templates on public.companies;
create trigger on_company_created_seed_templates
  after insert on public.companies
  for each row execute function public.handle_new_company_templates();

-- Seed templates for existing companies
do $$
declare
  rec record;
begin
  for rec in select id from public.companies loop
    perform public.seed_default_templates(rec.id);
  end loop;
end;
$$;
