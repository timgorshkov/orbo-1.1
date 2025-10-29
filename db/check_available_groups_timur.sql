-- Проверка доступных групп для Тимура Голицына

-- Org: a3e8bc8f-8171-472c-a955-2f7878aed6f1
-- Владелец: Тимур Голицын (tg_user_id: 5484900079)

-- Проверка 1: Группы, где Тимур админ
SELECT 
  '✅ Группы, где Тимур админ' as check_type,
  tga.tg_chat_id,
  tg.title,
  tga.is_owner,
  tga.is_admin,
  tg.bot_status,
  otg.org_id as linked_to_org,
  CASE 
    WHEN otg.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' THEN '🔵 Уже в этой org'
    WHEN otg.org_id IS NOT NULL THEN '⚪ В другой org'
    ELSE '🟢 Доступна для добавления'
  END as status
FROM telegram_group_admins tga
INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
LEFT JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
WHERE tga.tg_user_id = 5484900079
  AND tga.is_admin = true
  AND tga.expires_at > NOW()
ORDER BY tg.title;

-- Проверка 2: ВСЕ группы с bot_status='connected' (чужие тоже)
SELECT 
  '⚠️ ВСЕ группы с подключенным ботом' as check_type,
  tg.tg_chat_id,
  tg.title,
  tg.bot_status,
  otg.org_id as linked_to_org,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM telegram_group_admins tga2
      WHERE tga2.tg_chat_id = tg.tg_chat_id
        AND tga2.tg_user_id = 5484900079
        AND tga2.is_admin = true
        AND tga2.expires_at > NOW()
    ) THEN '✅ Тимур админ'
    ELSE '❌ Тимур НЕ админ (ЧУЖАЯ ГРУППА!)'
  END as timur_status
FROM telegram_groups tg
LEFT JOIN org_telegram_groups otg 
  ON otg.tg_chat_id = tg.tg_chat_id
  AND otg.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
WHERE tg.bot_status = 'connected'
ORDER BY 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM telegram_group_admins tga2
      WHERE tga2.tg_chat_id = tg.tg_chat_id
        AND tga2.tg_user_id = 5484900079
        AND tga2.is_admin = true
    ) THEN 1
    ELSE 2
  END,
  tg.title;

-- Проверка 3: Какие группы показывались ДО исправления
SELECT 
  '❌ ПРОБЛЕМА ДО: Чужие группы, которые показывались' as check_type,
  tg.tg_chat_id,
  tg.title,
  tg.bot_status,
  'Тимур НЕ админ здесь!' as issue
FROM telegram_groups tg
WHERE tg.bot_status = 'connected'
  AND NOT EXISTS (
    SELECT 1 FROM telegram_group_admins tga
    WHERE tga.tg_chat_id = tg.tg_chat_id
      AND tga.tg_user_id = 5484900079
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
  )
  AND NOT EXISTS (
    SELECT 1 FROM org_telegram_groups otg
    WHERE otg.tg_chat_id = tg.tg_chat_id
      AND otg.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  )
ORDER BY tg.title;

