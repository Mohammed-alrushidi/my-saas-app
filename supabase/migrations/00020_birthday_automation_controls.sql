-- 00020: Independent birthday automation controls and permission-gated manual sending.
-- Birthday automation is fail-closed and disabled for every company by default.

alter table public.permission_requests
  drop constraint if exists permission_requests_permission_check;
alter table public.permission_requests
  add constraint permission_requests_permission_check check (permission in (
    'templates:edit',
    'reminder_settings:edit',
    'broadcast:create',
    'birthday:send'
  ));

alter table public.staff_permission_grants
  drop constraint if exists staff_permission_grants_permission_check;
alter table public.staff_permission_grants
  add constraint staff_permission_grants_permission_check check (permission in (
    'templates:edit',
    'reminder_settings:edit',
    'broadcast:create',
    'birthday:send'
  ));

alter table public.message_templates
  add column if not exists provider_template_id text
    check (provider_template_id is null or provider_template_id ~ '^HX[0-9A-Fa-f]{32}$'),
  add column if not exists provider_category text
    check (provider_category is null or provider_category in ('marketing', 'utility')),
  add column if not exists provider_status text not null default 'draft'
    check (provider_status in ('draft', 'pending', 'approved', 'rejected', 'unavailable')),
  add column if not exists estimated_unit_cost_baisa integer
    check (estimated_unit_cost_baisa is null or estimated_unit_cost_baisa >= 0);

-- Provider approval metadata is authoritative server-side state. Existing
-- template RLS controls rows, but PostgreSQL column privileges are also needed
-- so an authenticated company user cannot forge an approved provider template.
revoke insert, update on table public.message_templates from anon, authenticated;
grant insert (company_id, template_type, name, body, is_default)
  on table public.message_templates to authenticated;
grant update (name, body, is_default)
  on table public.message_templates to authenticated;

alter table public.messages
  add column if not exists dispatch_source text
    check (dispatch_source is null or dispatch_source in ('manual', 'automatic')),
  add column if not exists birthday_year integer,
  add column if not exists estimated_cost_baisa integer
    check (estimated_cost_baisa is null or estimated_cost_baisa >= 0),
  add column if not exists actual_cost_baisa integer
    check (actual_cost_baisa is null or actual_cost_baisa >= 0),
  add column if not exists cost_currency text not null default 'OMR';

alter table public.messages
  drop constraint if exists messages_status_check;
alter table public.messages
  add constraint messages_status_check
    check (status in ('pending', 'sent', 'failed', 'skipped', 'canceled'));

alter table public.messages
  drop constraint if exists messages_delivery_status_check;
alter table public.messages
  add constraint messages_delivery_status_check
    check (delivery_status is null or delivery_status in (
      'queued', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'canceled'
    ));

create table if not exists public.birthday_automation_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  is_enabled boolean not null default false,
  template_id uuid references public.message_templates(id) on delete set null,
  send_time time not null default '09:00',
  timezone text not null default 'Asia/Muscat',
  limit_mode text not null default 'shared' check (limit_mode in ('shared', 'separate')),
  daily_limit integer not null default 250 check (daily_limit > 0),
  monthly_limit integer not null default 5000 check (monthly_limit > 0),
  budget_protection_enabled boolean not null default false,
  monthly_budget_baisa integer check (monthly_budget_baisa is null or monthly_budget_baisa >= 0),
  permission_confirmation_version text,
  permission_confirmed_by uuid references public.profiles(id) on delete set null,
  permission_confirmed_at timestamptz,
  enabled_by uuid references public.profiles(id) on delete set null,
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not budget_protection_enabled or monthly_budget_baisa is not null),
  check (permission_confirmation_version is null or permission_confirmation_version = 'birthday-contact-v1'),
  check (not is_enabled or template_id is not null)
);

alter table public.birthday_automation_settings enable row level security;

create policy "company_read_birthday_automation_settings"
  on public.birthday_automation_settings for select
  using (company_id = public.current_company_id());

create policy "company_admin_insert_birthday_automation_settings"
  on public.birthday_automation_settings for insert
  with check (company_id = public.current_company_id() and public.current_user_role() = 'company_admin');

create policy "company_admin_update_birthday_automation_settings"
  on public.birthday_automation_settings for update
  using (company_id = public.current_company_id() and public.current_user_role() = 'company_admin')
  with check (company_id = public.current_company_id() and public.current_user_role() = 'company_admin');

create trigger birthday_automation_settings_updated_at
  before update on public.birthday_automation_settings
  for each row execute function public.update_updated_at();

insert into public.birthday_automation_settings (company_id)
select id from public.companies
on conflict (company_id) do nothing;

create or replace function public.seed_default_birthday_automation_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.birthday_automation_settings (company_id)
  values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;

create trigger on_company_created_seed_birthday_automation_settings
  after insert on public.companies
  for each row execute function public.seed_default_birthday_automation_settings();

create table if not exists public.birthday_automation_audit (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'enabled', 'disabled', 'settings_updated', 'manual_sent', 'manual_blocked',
    'scheduled', 'sent', 'delivered', 'read', 'failed', 'canceled', 'cost_updated'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.birthday_automation_audit enable row level security;

create policy "company_admin_read_birthday_automation_audit"
  on public.birthday_automation_audit for select
  using (company_id = public.current_company_id() and public.current_user_role() = 'company_admin');

create index if not exists idx_birthday_audit_company_created
  on public.birthday_automation_audit(company_id, created_at desc);

create index if not exists idx_messages_birthday_year
  on public.messages(company_id, customer_record_id, birthday_year)
  where message_type = 'birthday' and birthday_year is not null;

create or replace function public.audit_birthday_message_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if new.message_type <> 'birthday' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.birthday_automation_audit (company_id, action, details)
      values (new.company_id, 'scheduled', jsonb_build_object(
        'message_id', new.id,
        'idempotency_key', new.idempotency_key,
        'dispatch_source', new.dispatch_source,
        'estimated_cost_baisa', new.estimated_cost_baisa
      ));
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('sent', 'failed', 'canceled') then
    insert into public.birthday_automation_audit (company_id, action, details)
    values (new.company_id, new.status, jsonb_build_object(
      'message_id', new.id,
      'idempotency_key', new.idempotency_key,
      'failure_reason', new.failure_reason
    ));
  end if;

  if new.delivery_status is distinct from old.delivery_status
    and new.delivery_status in ('delivered', 'read', 'failed', 'canceled') then
    v_action := new.delivery_status;
    insert into public.birthday_automation_audit (company_id, action, details)
    values (new.company_id, v_action, jsonb_build_object(
      'message_id', new.id,
      'provider_message_id', new.provider_message_id
    ));
  end if;

  if new.actual_cost_baisa is distinct from old.actual_cost_baisa then
    insert into public.birthday_automation_audit (company_id, action, details)
    values (new.company_id, 'cost_updated', jsonb_build_object(
      'message_id', new.id,
      'estimated_cost_baisa', new.estimated_cost_baisa,
      'actual_cost_baisa', new.actual_cost_baisa,
      'currency', new.cost_currency
    ));
  end if;

  return new;
end;
$$;

create trigger audit_birthday_message_lifecycle
  after insert or update on public.messages
  for each row execute function public.audit_birthday_message_lifecycle();

-- Atomically checks the automation mode, tenant/customer/template safety gates,
-- count limits, birthday budget, and annual idempotency before reserving a send.
-- Only the server-side service role may call this function.
create or replace function public.claim_birthday_message(
  p_company_id uuid,
  p_customer_record_id uuid,
  p_template_id uuid,
  p_dispatch_source text,
  p_recipient_mobile text,
  p_message_body text,
  p_birthday_year integer,
  p_estimated_cost_baisa integer
)
returns table(outcome text, idempotency_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.birthday_automation_settings%rowtype;
  v_template_name text;
  v_key text := 'birthday:' || p_company_id::text || ':' || p_recipient_mobile || ':' || p_birthday_year::text;
  v_now timestamptz := now();
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_day_count bigint;
  v_month_count bigint;
  v_reserved_cost bigint;
  v_business_date date;
begin
  if p_dispatch_source not in ('manual', 'automatic')
    or p_birthday_year < 2000
    or coalesce(p_estimated_cost_baisa, -1) < 0 then
    return query select 'invalid_request'::text, v_key;
    return;
  end if;

  if not exists (
    select 1 from public.companies
    where id = p_company_id
      and is_active = true
  ) then
    return query select 'company_suspended'::text, v_key;
    return;
  end if;

  select * into v_settings
  from public.birthday_automation_settings
  where company_id = p_company_id
  for update;

  if not found then
    return query select 'settings_unavailable'::text, v_key;
    return;
  end if;

  if (p_dispatch_source = 'automatic' and not v_settings.is_enabled)
    or (p_dispatch_source = 'manual' and v_settings.is_enabled) then
    return query select 'mode_blocked'::text, v_key;
    return;
  end if;

  if p_dispatch_source = 'automatic' and v_settings.template_id is distinct from p_template_id then
    return query select 'template_unavailable'::text, v_key;
    return;
  end if;

  v_business_date := (v_now at time zone v_settings.timezone)::date;

  select name into v_template_name
  from public.message_templates
  where id = p_template_id
    and company_id = p_company_id
    and template_type = 'birthday'
    and provider_category = 'marketing'
    and provider_status = 'approved'
    and provider_template_id is not null;

  if not found then
    return query select 'template_unavailable'::text, v_key;
    return;
  end if;

  if (
    select count(*) from public.customer_records
    where company_id = p_company_id and mobile_no = p_recipient_mobile
  ) <> 1 or not exists (
    select 1 from public.customer_records
    where id = p_customer_record_id
      and company_id = p_company_id
      and communication_status = 'allowed'
      and mobile_no = p_recipient_mobile
      and mobile_no ~ '^\+968[0-9]{8}$'
      and driver_dob is not null
      and (
        to_char(driver_dob, 'MMDD') = to_char(v_business_date, 'MMDD')
        or (
          to_char(driver_dob, 'MMDD') = '0229'
          and to_char(v_business_date, 'MMDD') = '0228'
          and not (
            mod(extract(year from v_business_date)::integer, 400) = 0
            or (
              mod(extract(year from v_business_date)::integer, 4) = 0
              and mod(extract(year from v_business_date)::integer, 100) <> 0
            )
          )
        )
      )
  ) or exists (
    select 1 from public.opt_outs
    where company_id = p_company_id and mobile_no = p_recipient_mobile
  ) then
    return query select 'customer_ineligible'::text, v_key;
    return;
  end if;

  v_day_start := date_trunc('day', v_now at time zone v_settings.timezone) at time zone v_settings.timezone;
  v_month_start := date_trunc('month', v_now at time zone v_settings.timezone) at time zone v_settings.timezone;

  select count(*) into v_day_count
  from public.messages
  where company_id = p_company_id
    and created_at >= v_day_start
    and created_at < v_day_start + interval '1 day'
    and (v_settings.limit_mode = 'shared' or message_type = 'birthday');

  select count(*), coalesce(sum(estimated_cost_baisa), 0)
  into v_month_count, v_reserved_cost
  from public.messages
  where company_id = p_company_id
    and created_at >= v_month_start
    and created_at < v_month_start + interval '1 month'
    and (v_settings.limit_mode = 'shared' or message_type = 'birthday');

  if v_day_count >= v_settings.daily_limit or v_month_count >= v_settings.monthly_limit then
    return query select 'limit_reached'::text, v_key;
    return;
  end if;

  if v_settings.budget_protection_enabled
    and v_reserved_cost + p_estimated_cost_baisa > v_settings.monthly_budget_baisa then
    return query select 'budget_reached'::text, v_key;
    return;
  end if;

  insert into public.messages (
    company_id, customer_record_id, message_type, recipient_mobile,
    template_used, message_body, status, idempotency_key, dispatch_source,
    birthday_year, estimated_cost_baisa, cost_currency
  ) values (
    p_company_id, p_customer_record_id, 'birthday', p_recipient_mobile,
    v_template_name, p_message_body, 'pending', v_key, p_dispatch_source,
    p_birthday_year, p_estimated_cost_baisa, 'OMR'
  ) on conflict do nothing;

  if found then
    return query select 'claimed'::text, v_key;
  else
    return query select 'duplicate'::text, v_key;
  end if;
end;
$$;

revoke all on function public.claim_birthday_message(uuid, uuid, uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_birthday_message(uuid, uuid, uuid, text, text, text, integer, integer) to service_role;
