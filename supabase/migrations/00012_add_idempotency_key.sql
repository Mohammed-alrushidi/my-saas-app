-- 00012: Add idempotency_key for Scheduler durable idempotency
--
-- Allows atomic claim of a dispatch slot before provider execution.
-- The unique partial index enforces that only one Scheduler run can
-- insert a message with the same key. A second concurrent run gets a
-- unique violation and skips safely.

alter table if exists public.messages
  add column if not exists idempotency_key text;

create unique index if not exists idx_messages_idempotency_key
  on public.messages(idempotency_key)
  where idempotency_key is not null;
