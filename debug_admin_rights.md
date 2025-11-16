# Диагностика прав администраторов

## Шаг 1: Найти org_id и chat_id группы Test2

```sql
SELECT 
  o.id as org_id,
  o.name as org_name,
  tg.tg_chat_id,
  tg.title as group_title
FROM organizations o
JOIN org_telegram_groups otg ON otg.org_id = o.id
JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE tg.title ILIKE '%Test2%'
LIMIT 10;
```

## Шаг 2: Проверить telegram_group_admins (ИСПРАВЛЕНО)

```sql
SELECT 
  tga.tg_user_id,
  tga.is_admin,
  tga.is_owner,
  tga.custom_title,
  tga.verified_at,
  tga.expires_at,
  tga.user_telegram_account_id,
  p.full_name,
  p.username,
  p.email
FROM telegram_group_admins tga
LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
WHERE tga.tg_chat_id = -1002994446785
ORDER BY tga.verified_at DESC;
```

## Шаг 3: Проверить memberships (права в организации)

После получения `org_id` из Шага 1:

```sql
SELECT 
  m.user_id,
  m.role,
  m.role_source,
  m.metadata->>'telegram_group_titles' as telegram_groups,
  m.metadata->>'synced_at' as synced_at,
  u.email
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  AND m.role = 'admin'
ORDER BY m.role_source;
```

## Шаг 4: Найти Тима Голицина (ИСПРАВЛЕНО)

```sql
SELECT 
  p.id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.email,
  p.org_id
FROM participants p
WHERE (p.full_name ILIKE '%Голицин%'
   OR p.full_name ILIKE '%Тимур%'
   OR p.username ILIKE '%golitsin%'
   OR p.email ILIKE '%tind%')
  AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
LIMIT 20;
```

## Шаг 5: Проверить права Тима в конкретной группе (ИСПРАВЛЕНО)

```sql
SELECT 
  tga.id,
  tga.tg_chat_id,
  tga.tg_user_id,
  tga.is_admin,
  tga.is_owner,
  tga.custom_title,
  tga.verified_at,
  tga.expires_at,
  tga.created_at,
  tga.updated_at,
  NOW() as current_time,
  (tga.expires_at > NOW()) as is_not_expired
FROM telegram_group_admins tga
WHERE tga.tg_user_id = 5484900079
  AND tga.tg_chat_id = -1002994446785;
```

## Шаг 6: КРИТИЧЕСКИЙ - Проверить РЕАЛЬНОЕ состояние прав

Проверим, что **действительно** произошло после нашего фикса:

```sql
-- Все записи админов для Test2
SELECT 
  tga.tg_user_id,
  tga.is_admin,
  tga.is_owner,
  tga.verified_at,
  tga.expires_at,
  (tga.expires_at > NOW()) as still_valid,
  tga.updated_at,
  p.full_name,
  p.email
FROM telegram_group_admins tga
LEFT JOIN participants p ON p.tg_user_id = tga.tg_user_id AND p.org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
WHERE tga.tg_chat_id = -1002994446785
ORDER BY tga.updated_at DESC;
```

## Что проверить:

1. **В telegram_group_admins:** 
   - `is_admin` должен быть `false` для Тима в группе Test2
   - `expires_at` должен быть в прошлом (или близко к текущему времени)

2. **В memberships:**
   - Если Тим админ только в Test2, запись должна быть удалена
   - Если Тим админ в других группах, `metadata->>'telegram_group_titles'` не должен содержать "Test2"

3. **Если ничего не изменилось:**
   - Проверьте логи API: `/api/telegram/groups/update-admin-rights` должен был вызваться
   - Проверьте, что функция `sync_telegram_admins()` выполнилась без ошибок

