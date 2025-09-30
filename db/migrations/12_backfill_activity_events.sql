-- Populate telegram_activity_events with existing activity_events and identities
insert into public.telegram_activity_events (
  tg_chat_id,
  identity_id,
  tg_user_id,
  event_type,
  created_at,
  message_id,
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
  (ae.meta->>'reply_to_message_id')::bigint,
  ae.meta
from public.activity_events ae
left join public.participants p on p.id = ae.participant_id
left join public.telegram_identities ti on ti.tg_user_id = ae.tg_user_id
where ae.tg_group_id is not null
  and ae.tg_user_id is not null
  and coalesce(p.identity_id, ti.id) is not null;
