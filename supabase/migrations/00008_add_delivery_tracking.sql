-- 00008: Add provider_message_id and delivery_status to messages

alter table if exists public.messages
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text check (delivery_status in ('queued', 'sent', 'delivered', 'undelivered', 'failed'));

create index if not exists idx_messages_provider_id on public.messages(provider_message_id);
