-- 00019: Add an indexable month/day key for birthday queries.
--
-- PostgreSQL date columns do not support LIKE. Keeping MMDD derived by the
-- database avoids string matching, timezone conversion, and application/data
-- drift while preserving the existing customer_records RLS policies.

alter table public.customer_records
  add column if not exists driver_birth_mmdd smallint
  generated always as (
    extract(month from driver_dob)::integer * 100
    + extract(day from driver_dob)::integer
  ) stored;

create index if not exists idx_customer_records_company_birth_mmdd
  on public.customer_records(company_id, driver_birth_mmdd)
  where driver_birth_mmdd is not null;
