-- 00013: Add broadcast_submissions for Broadcast submission idempotency
--
-- Enables atomic claim of a Broadcast submission before provider execution.
-- The unique constraint on (company_id, submission_key) ensures that only one
-- processing request can claim a given submission. A duplicate concurrent or
-- retried request receives the existing submission status instead of calling
-- the provider again.

create table if not exists public.broadcast_submissions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  submission_key text not null,
  payload_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed', 'uncertain')),
  recipient_count integer not null check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_by uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  last_error_code text null
);

alter table public.broadcast_submissions enable row level security;

-- Named unique index for reliable 23505 detection in application code
create unique index if not exists idx_broadcast_submissions_company_key
  on public.broadcast_submissions(company_id, submission_key);

-- RLS: company members can select submissions belonging to their company
drop policy if exists "company_select_broadcast_submissions" on public.broadcast_submissions;
create policy "company_select_broadcast_submissions"
  on public.broadcast_submissions for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- RLS: only company_admin may insert submissions
drop policy if exists "company_admin_insert_broadcast_submissions" on public.broadcast_submissions;
create policy "company_admin_insert_broadcast_submissions"
  on public.broadcast_submissions for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

-- RLS: only company_admin may update submissions
drop policy if exists "company_admin_update_broadcast_submissions" on public.broadcast_submissions;
create policy "company_admin_update_broadcast_submissions"
  on public.broadcast_submissions for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

-- Auto-update updated_at on changes
drop trigger if exists broadcast_submissions_updated_at on public.broadcast_submissions;
create trigger broadcast_submissions_updated_at
  before update on public.broadcast_submissions
  for each row execute function public.update_updated_at();
