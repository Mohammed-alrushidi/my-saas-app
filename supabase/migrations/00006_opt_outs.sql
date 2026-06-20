-- 00006: Opt-Outs

create table if not exists public.opt_outs (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mobile_no text not null,
  source text not null default 'company_added' check (source in ('reply_stop', 'company_added', 'import')),
  opted_out_at timestamptz not null default now()
);

alter table public.opt_outs enable row level security;

drop policy if exists "company_select_opt_outs" on public.opt_outs;
create policy "company_select_opt_outs"
  on public.opt_outs for select
  using (company_id = (select company_id from public.profiles where id = auth.uid()));

drop policy if exists "company_admin_insert_opt_outs" on public.opt_outs;
create policy "company_admin_insert_opt_outs"
  on public.opt_outs for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

drop policy if exists "company_admin_delete_opt_outs" on public.opt_outs;
create policy "company_admin_delete_opt_outs"
  on public.opt_outs for delete
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'company_admin'
  );

create index if not exists idx_opt_outs_company_mobile on public.opt_outs(company_id, mobile_no);
