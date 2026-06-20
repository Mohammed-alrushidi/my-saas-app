-- 00003: Customer Records, Imports, and Import Errors

-- ==============================
-- CUSTOMER RECORDS
-- ==============================
create table if not exists public.customer_records (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid,
  policy_no text not null,
  quotation_no text,
  customer_name text not null,
  mobile_no text not null,
  policy_expiry_date date not null,
  veh_make_model text,
  driver_age int,
  driver_dob date,
  new_premium_vat_amount numeric,
  communication_status text not null default 'allowed' check (communication_status in ('allowed', 'opted_out', 'invalid_number')),
  created_at timestamptz not null default now()
);

alter table public.customer_records enable row level security;

-- Company Admin and Staff can view their company's records
drop policy if exists "company_select_customer_records" on public.customer_records;
create policy "company_select_customer_records"
  on public.customer_records for select
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('company_admin', 'staff'))
  );

-- Company Admin can insert records for their company
drop policy if exists "company_admin_insert_customer_records" on public.customer_records;
create policy "company_admin_insert_customer_records"
  on public.customer_records for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'company_admin')
  );

-- Company Admin can update records in their company
drop policy if exists "company_admin_update_customer_records" on public.customer_records;
create policy "company_admin_update_customer_records"
  on public.customer_records for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'company_admin')
  );

-- Super Admin can read all records (support)
drop policy if exists "super_admin_select_customer_records" on public.customer_records;
create policy "super_admin_select_customer_records"
  on public.customer_records for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin'));

-- ==============================
-- IMPORTS
-- ==============================
create table if not exists public.imports (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_name text not null,
  storage_path text,
  total_rows int not null default 0,
  valid_rows int not null default 0,
  invalid_rows int not null default 0,
  status text not null default 'completed' check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

alter table public.imports enable row level security;

-- Company Admin and Staff can view their company's imports
drop policy if exists "company_select_imports" on public.imports;
create policy "company_select_imports"
  on public.imports for select
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('company_admin', 'staff'))
  );

-- Company Admin can create import records
drop policy if exists "company_admin_insert_imports" on public.imports;
create policy "company_admin_insert_imports"
  on public.imports for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'company_admin')
  );

-- ==============================
-- IMPORT ERRORS
-- ==============================
create table if not exists public.import_errors (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid not null references public.imports(id) on delete cascade,
  row_number int not null,
  field text,
  value text,
  error_message text not null,
  created_at timestamptz not null default now()
);

alter table public.import_errors enable row level security;

-- Company Admin and Staff can view errors for their company's imports
drop policy if exists "company_select_import_errors" on public.import_errors;
create policy "company_select_import_errors"
  on public.import_errors for select
  using (
    exists (
      select 1 from public.imports
      where imports.id = import_id
      and imports.company_id = (select company_id from public.profiles where id = auth.uid())
    )
  );

-- Company Admin can insert errors during import
drop policy if exists "company_admin_insert_import_errors" on public.import_errors;
create policy "company_admin_insert_import_errors"
  on public.import_errors for insert
  with check (
    exists (
      select 1 from public.imports
      where imports.id = import_id
      and imports.company_id = (select company_id from public.profiles where id = auth.uid())
    )
  );

-- ==============================
-- STORAGE BUCKET
-- ==============================
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- Company users can read files in their company folder
drop policy if exists "company_read_import_files" on storage.objects;
create policy "company_read_import_files"
  on storage.objects for select
  using (
    bucket_id = 'imports'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and company_id = (regexp_match(name, '^([^/]+)'))[1]::uuid
    )
  );

-- Company Admin can upload files
drop policy if exists "company_admin_insert_import_files" on storage.objects;
create policy "company_admin_insert_import_files"
  on storage.objects for insert
  with check (
    bucket_id = 'imports'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role = 'company_admin'
    )
  );

-- ==============================
-- INDEXES
-- ==============================
create index if not exists idx_customer_records_company_id on public.customer_records(company_id);
create index if not exists idx_customer_records_policy_no on public.customer_records(policy_no);
create index if not exists idx_customer_records_mobile_no on public.customer_records(mobile_no);
create index if not exists idx_customer_records_expiry_date on public.customer_records(policy_expiry_date);
create index if not exists idx_imports_company_id on public.imports(company_id);
create index if not exists idx_import_errors_import_id on public.import_errors(import_id);
