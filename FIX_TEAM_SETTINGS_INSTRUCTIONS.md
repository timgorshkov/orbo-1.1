# Исправление страницы "Команда организации"

## Проблемы, которые были исправлены:

### 1. ❌ Владелец дублировался в списке админов
**Причина:** В таблице `memberships` одн пользователь имел несколько записей (owner + admin)
**Решение:** 
- Добавлена фильтрация на уровне компонента
- Создан SQL скрипт для очистки дублей в базе

### 2. ❌ Неправильное отображение верификации Email и Telegram
**Причина:** View `organization_admins` использовал фильтр `is_verified=true` в секции JOIN, что исключало неверифицированные записи из результата
**Решение:**
- Исправлен view (миграция 060)
- Убран фильтр из JOIN
- Теперь `has_verified_telegram` корректно показывает значение `is_verified`

## Что нужно сделать ПОСЛЕ деплоя:

### Шаг 1: Применить миграцию 060

В Supabase SQL Editor выполните:

```sql
-- Файл: db/migrations/060_fix_organization_admins_verification.sql

DROP VIEW IF EXISTS organization_admins;

CREATE VIEW organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  m.created_at,
  
  u.email,
  (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL) as email_confirmed,
  u.email_confirmed_at,
  
  COALESCE(
    p.full_name,
    NULLIF(TRIM(CONCAT(uta.telegram_first_name, ' ', uta.telegram_last_name)), ''),
    uta.telegram_first_name,
    u.email,
    'Администратор'
  ) as full_name,
  
  COALESCE(uta.telegram_username, p.username) as telegram_username,
  COALESCE(uta.telegram_user_id, p.tg_user_id) as tg_user_id,
  COALESCE(uta.is_verified, false) as has_verified_telegram,
  COALESCE(uta.telegram_first_name, p.tg_first_name) as telegram_first_name,
  COALESCE(uta.telegram_last_name, p.tg_last_name) as telegram_last_name,
  
  o.name as org_name,
  
  COALESCE((m.metadata->>'shadow_profile')::boolean, false) as is_shadow_profile,
  
  m.metadata->>'custom_titles' as custom_titles_json,
  m.metadata->'telegram_groups' as telegram_group_ids,
  m.metadata->'telegram_group_titles' as telegram_group_titles,
  
  (m.metadata->>'synced_at')::timestamptz as last_synced_at
  
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id 
  AND uta.org_id = m.org_id
LEFT JOIN participants p ON p.user_id = m.user_id 
  AND p.org_id = m.org_id 
  AND p.merged_into IS NULL
LEFT JOIN organizations o ON o.id = m.org_id
WHERE m.role IN ('owner', 'admin')
ORDER BY 
  CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
  m.created_at;
```

### Шаг 2: Удалить дубли владельца

```sql
-- Файл: db/fix_owner_admin_duplicates.sql

DELETE FROM memberships m1
WHERE m1.role = 'admin'
AND EXISTS (
  SELECT 1 
  FROM memberships m2 
  WHERE m2.org_id = m1.org_id 
    AND m2.user_id = m1.user_id 
    AND m2.role = 'owner'
);
```

### Шаг 3: Проверить результат

```sql
-- Файл: db/verify_fixes.sql
-- Этот скрипт проверит:
-- - Нет ли дублей
-- - Правильно ли отображается верификация email
-- - Правильно ли отображается верификация Telegram
```

### Шаг 4: Обновить страницу настроек

После выполнения всех скриптов:
1. Обновите страницу настроек организации (F5)
2. Проверьте:
   - ✅ Владелец показывается только один раз
   - ✅ Email статус отображается корректно
   - ✅ Telegram статус отображается корректно

## Отладочные скрипты

### Проверить реальные данные:
```sql
-- Файл: db/real_data_check.sql
-- Показывает что на самом деле хранится в таблицах
```

### Проверить что возвращает view:
```sql
SELECT * FROM organization_admins 
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
```

## Ключевые изменения в коде:

### 1. View organization_admins
**Было:**
```sql
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id 
  AND (uta.org_id = m.org_id OR uta.org_id IS NULL) 
  AND uta.is_verified = true  -- ❌ Фильтр в JOIN исключал неверифицированные записи
```

**Стало:**
```sql
LEFT JOIN user_telegram_accounts uta ON uta.user_id = m.user_id 
  AND uta.org_id = m.org_id  -- ✅ Только проверка org_id
```

### 2. Компонент OrganizationTeam
**Добавлена фильтрация:**
```typescript
const admins = team.filter(m => 
  m.role === 'admin' && 
  m.user_id !== owner?.user_id  // Не показываем владельца в списке админов
)
```

### 3. Страница settings
**Убрано переопределение данных:**
```typescript
// Было: неправильно переопределяли данные из view
has_verified_telegram: !!telegramAccount  // ❌ Всегда false

// Стало: используем данные из view напрямую
...member  // ✅ View уже содержит правильные значения
```

