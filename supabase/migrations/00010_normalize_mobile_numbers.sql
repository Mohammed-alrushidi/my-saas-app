-- 00010: Normalize existing mobile numbers to E.164 (+968...)
-- Run this in Supabase Dashboard SQL Editor after deploying the code changes.

-- Helper: normalize a single mobile number
-- If it starts with +     → keep
-- If it starts with 00    → replace with +
-- If it starts with 968   → prepend +
-- Otherwise               → prepend +968
create or replace function public.normalize_mobile(m text)
returns text
language sql
immutable
as $$
  select case
    when m is null or m = '' then m
    when m like '+%' then m
    when m like '00%' then '+' || substr(m, 3)
    when m like '968%' then '+' || m
    else '+968' || m
  end
$$;

-- Fix customer_records
update public.customer_records
set mobile_no = public.normalize_mobile(mobile_no)
where mobile_no is not null
  and mobile_no not like '+%';

-- Fix messages
update public.messages
set recipient_mobile = public.normalize_mobile(recipient_mobile)
where recipient_mobile is not null
  and recipient_mobile not like '+%';

-- Fix opt_outs
update public.opt_outs
set mobile_no = public.normalize_mobile(mobile_no)
where mobile_no is not null
  and mobile_no not like '+%';

drop function if exists public.normalize_mobile;
