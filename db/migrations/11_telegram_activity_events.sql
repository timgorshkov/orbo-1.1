create table if not exists public.telegram_activity_events (
  id bigserial primary key,
  tg_chat_id bigint not null,
  identity_id uuid references public.telegram_identities(id) on delete cascade,
  tg_user_id bigint,
  event_type text not null,
  created_at timestamptz not null default now(),
  message_id bigint,
  thread_id bigint,
  reply_to_message_id bigint,
  meta jsonb
);

create index if not exists telegram_activity_events_chat_idx
  on public.telegram_activity_events (tg_chat_id, created_at desc);

create index if not exists telegram_activity_events_identity_idx
  on public.telegram_activity_events (identity_id, created_at desc);

create index if not exists telegram_activity_events_type_idx
  on public.telegram_activity_events (event_type, created_at desc);
