-- Ensure thread columns exist before backfill
ALTER TABLE public.telegram_activity_events
  ADD COLUMN IF NOT EXISTS message_thread_id bigint,
  ADD COLUMN IF NOT EXISTS thread_title text;

-- Populate telegram_activity_events with existing activity_events and identities
insert into public.telegram_activity_events (
  tg_chat_id,
  identity_id,
  tg_user_id,
  event_type,
  created_at,
  message_id,
  message_thread_id,
  thread_title,
  reply_to_message_id,
  meta
)
select
  ae.tg_group_id,
  coalesce(p.identity_id, ti.id),
  ae.tg_user_id,
  ae.type,
  ae.created_at,
  (ae.meta->>'message_id')::bigint,
  (ae.meta->>'message_thread_id')::bigint,
  null,
  (ae.meta->>'reply_to_message_id')::bigint,
  ae.meta
from public.activity_events ae
left join public.participants p on p.id = ae.participant_id
left join public.telegram_identities ti on ti.tg_user_id = ae.tg_user_id
where ae.tg_group_id is not null
  and ae.tg_user_id is not null
  and coalesce(p.identity_id, ti.id) is not null;
