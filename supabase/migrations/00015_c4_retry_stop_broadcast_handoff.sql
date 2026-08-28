-- 00015: C4 retry lineage, idempotent opt-outs, and broadcast handoff

-- Concurrent STOP callbacks must collapse to one tenant/mobile opt-out.
-- Production preflight must confirm there are no existing duplicates before apply.
drop index if exists public.idx_opt_outs_company_mobile;
create unique index idx_opt_outs_company_mobile
  on public.opt_outs(company_id, mobile_no);

-- Keep the opt-out row and the customer send gate in the same transaction.
-- The webhook also repeats this scoped update so a signed duplicate can heal
-- data created before this trigger existed.
create or replace function public.sync_opt_out_customer_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.customer_records
  set communication_status = 'opted_out'
  where company_id = new.company_id
    and mobile_no = new.mobile_no;
  return new;
end;
$$;

revoke execute on function public.sync_opt_out_customer_status() from public, anon, authenticated;

drop trigger if exists sync_opt_out_customer_status on public.opt_outs;
create trigger sync_opt_out_customer_status
  after insert on public.opt_outs
  for each row execute function public.sync_opt_out_customer_status();

-- Heal any pre-C4 drift before the application starts relying on the synced
-- customer flag for scheduler/manual/broadcast eligibility checks.
update public.customer_records customer
set communication_status = 'opted_out'
where customer.communication_status <> 'opted_out'
  and exists (
    select 1
    from public.opt_outs opt_out
    where opt_out.company_id = customer.company_id
      and opt_out.mobile_no = customer.mobile_no
  );

-- Retry attempts are immutable message-history rows. The unique lineage/attempt
-- claim ensures only one concurrent request can call the provider for an attempt.
alter table if exists public.messages
  add column if not exists retry_of_message_id uuid references public.messages(id) on delete restrict,
  add column if not exists retry_attempt smallint,
  add column if not exists retry_not_before timestamptz;

alter table public.messages
  drop constraint if exists messages_retry_attempt_check;
alter table public.messages
  add constraint messages_retry_attempt_check
  check (retry_attempt is null or retry_attempt between 1 and 3);

create unique index if not exists idx_messages_retry_attempt
  on public.messages(retry_of_message_id, retry_attempt)
  where retry_of_message_id is not null;

create index if not exists idx_messages_retry_lineage
  on public.messages(company_id, retry_of_message_id, retry_attempt);

-- Staff submit a complete immutable review snapshot. Admin review and send
-- transitions are conditional in application code; RLS confines every row to
-- the caller's tenant and prevents staff from reviewing or sending.
create table if not exists public.broadcast_drafts (
  id uuid primary key default extensions.uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  message_body text not null check (char_length(btrim(message_body)) between 1 and 1600),
  recipient_ids uuid[] not null check (cardinality(recipient_ids) between 1 and 50),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'sending', 'sent', 'failed')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.broadcast_drafts enable row level security;

create index if not exists idx_broadcast_drafts_company_status_created
  on public.broadcast_drafts(company_id, status, created_at desc);

drop policy if exists "creator_insert_broadcast_drafts" on public.broadcast_drafts;
create policy "creator_insert_broadcast_drafts"
  on public.broadcast_drafts for insert
  with check (
    auth.uid() = created_by
    and status = 'pending_review'
    and company_id = (select company_id from public.profiles where id = auth.uid() and is_active = true)
    and (
      (select role from public.profiles where id = auth.uid()) = 'company_admin'
      or exists (
        select 1 from public.staff_permission_grants grant_row
        where grant_row.company_id = broadcast_drafts.company_id
          and grant_row.staff_id = auth.uid()
          and grant_row.permission = 'broadcast:create'
          and grant_row.is_active = true
      )
    )
  );

drop policy if exists "creator_select_own_broadcast_drafts" on public.broadcast_drafts;
create policy "creator_select_own_broadcast_drafts"
  on public.broadcast_drafts for select
  using (
    created_by = auth.uid()
    and company_id = (select company_id from public.profiles where id = auth.uid() and is_active = true)
  );

drop policy if exists "admin_select_company_broadcast_drafts" on public.broadcast_drafts;
create policy "admin_select_company_broadcast_drafts"
  on public.broadcast_drafts for select
  using (
    company_id = (
      select company_id from public.profiles
      where id = auth.uid() and role = 'company_admin' and is_active = true
    )
  );

drop policy if exists "admin_update_company_broadcast_drafts" on public.broadcast_drafts;
create policy "admin_update_company_broadcast_drafts"
  on public.broadcast_drafts for update
  using (
    company_id = (
      select company_id from public.profiles
      where id = auth.uid() and role = 'company_admin' and is_active = true
    )
  )
  with check (
    company_id = (
      select company_id from public.profiles
      where id = auth.uid() and role = 'company_admin' and is_active = true
    )
    and reviewed_by = auth.uid()
  );

drop trigger if exists broadcast_drafts_updated_at on public.broadcast_drafts;
create trigger broadcast_drafts_updated_at
  before update on public.broadcast_drafts
  for each row execute function public.update_updated_at();
