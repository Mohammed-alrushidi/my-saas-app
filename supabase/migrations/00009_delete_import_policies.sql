-- 00009: DELETE RLS policies for company_admin (undo import feature)

-- Company Admin can delete customer records in their company
drop policy if exists "company_admin_delete_customer_records" on public.customer_records;
create policy "company_admin_delete_customer_records"
  on public.customer_records for delete
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'company_admin')
  );

-- Company Admin can delete imports belonging to their company
drop policy if exists "company_admin_delete_imports" on public.imports;
create policy "company_admin_delete_imports"
  on public.imports for delete
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'company_admin')
  );

-- Company Admin can delete import errors linked to their company's imports
drop policy if exists "company_admin_delete_import_errors" on public.import_errors;
create policy "company_admin_delete_import_errors"
  on public.import_errors for delete
  using (
    exists (
      select 1 from public.imports
      where imports.id = import_errors.import_id
      and imports.company_id = (select company_id from public.profiles where id = auth.uid())
    )
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'company_admin')
  );
