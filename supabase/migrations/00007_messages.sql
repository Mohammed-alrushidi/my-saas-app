-- 00007: Messages

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_record_id uuid references public.customer_records(id) on delete set null,
  message_type text not null check (message_type in ('renewal', 'birthday', 'broadcast')),
  recipient_mobile text not null,
  template_used text,
  message_body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  failure_reason text,
  reminder_stage int,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "company_select_messages" on public.messages;
create policy "company_select_messages"
  on public.messages for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists "company_admin_insert_messages" on public.messages;
create policy "company_admin_insert_messages"
  on public.messages for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop policy if exists "company_admin_update_messages" on public.messages;
create policy "company_admin_update_messages"
  on public.messages for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

create index if not exists idx_messages_company_id on public.messages(company_id);
create index if not exists idx_messages_customer_record_id on public.messages(customer_record_id);
create index if not exists idx_messages_status on public.messages(status);
create index if not exists idx_messages_type on public.messages(message_type);
