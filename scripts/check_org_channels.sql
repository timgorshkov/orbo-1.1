-- Check all channels in PRO-тусовка organization

SELECT 
  tc.id,
  tc.tg_chat_id,
  tc.title,
  tc.username,
  TO_CHAR(tc.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
  COUNT(DISTINCT cp.id) as posts_count,
  COUNT(DISTINCT cs.id) as subscribers_count,
  tc.last_post_at
FROM telegram_channels tc
LEFT JOIN org_telegram_channels otc ON otc.channel_id = tc.id
LEFT JOIN channel_posts cp ON cp.channel_id = tc.id
LEFT JOIN channel_subscribers cs ON cs.channel_id = tc.id
WHERE otc.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'::uuid
GROUP BY tc.id, tc.tg_chat_id, tc.title, tc.username, tc.created_at, tc.last_post_at
ORDER BY tc.created_at;
