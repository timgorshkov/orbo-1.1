# Применение миграций 30-32: User ID и Memberships

## Дата: 12.10.2025

## Обзор

Для корректной работы интерфейса участников нужно применить **3 миграции** в правильном порядке:

1. **30_add_user_id_to_participants.sql** - добавляет колонку `user_id` в таблицу `participants`
2. **31_fix_sync_telegram_admins.sql** - исправляет функцию `sync_telegram_admins` (уже применена ✅)
3. **32_create_missing_memberships.sql** - создает `membership` для существующих участников

---

## ⚠️ Важно: Порядок применения

**Миграции должны применяться строго по порядку!**

### Миграция 30 → Миграция 31 → Миграция 32

Если применить миграцию 32 до миграции 30, получите ошибку:
```
ERROR: 42703: column p.user_id does not exist
```

---

## Миграция 30: Добавление user_id в participants

### Что делает

1. Добавляет колонку `user_id UUID` в таблицу `participants`
2. Создает foreign key на `auth.users(id)` с `ON DELETE CASCADE`
3. Создает индексы для ускорения запросов
4. Пытается заполнить `user_id` из `user_telegram_accounts` для существующих участников

### SQL

```sql
-- db/migrations/30_add_user_id_to_participants.sql

-- Add user_id column to participants (nullable initially)
ALTER TABLE participants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);

-- Create composite index for org_id + user_id queries
CREATE INDEX IF NOT EXISTS idx_participants_org_user ON participants(org_id, user_id);

-- Try to populate user_id from user_telegram_accounts
UPDATE participants p
SET user_id = uta.user_id
FROM user_telegram_accounts uta
WHERE 
  p.user_id IS NULL
  AND p.tg_user_id IS NOT NULL
  AND uta.telegram_user_id = p.tg_user_id::text
  AND uta.org_id = p.org_id;

-- Log the result
DO $$
DECLARE
  updated_count INT;
  total_without_user_id INT;
BEGIN
  SELECT COUNT(*) INTO total_without_user_id
  FROM participants
  WHERE user_id IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Populated user_id for existing participants';
  RAISE NOTICE '% participants still without user_id (will be linked on next login)', total_without_user_id;
END $$;

COMMENT ON COLUMN participants.user_id IS 'Reference to auth.users. Links participant to authenticated user account.';
```

### Применение

**В Supabase SQL Editor**:

1. Откройте файл `db/migrations/30_add_user_id_to_participants.sql`
2. Скопируйте весь SQL
3. Вставьте в SQL Editor
4. Нажмите **Run**

**Ожидаемый вывод**:
```
Success. No rows returned
NOTICE: Populated user_id for existing participants
NOTICE: 5 participants still without user_id (will be linked on next login)
```

**Проверка**:
```sql
-- Проверка, что колонка добавлена
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'participants' AND column_name = 'user_id';
-- Должно вернуть: user_id | uuid | YES

-- Проверка заполнения
SELECT 
  COUNT(*) AS total,
  COUNT(user_id) AS with_user_id,
  COUNT(*) - COUNT(user_id) AS without_user_id
FROM participants;
```

---

## Миграция 31: Исправление sync_telegram_admins

**Статус**: ✅ **Уже применена** (в предыдущем шаге)

Если не применена, см. `db/migrations/31_fix_sync_telegram_admins.sql`

---

## Миграция 32: Создание недостающих memberships

### Что делает

Создает записи `memberships` с `role='member'` для всех `participants`, у которых:
- Есть `user_id` (заполнен в миграции 30)
- Статус `participant` или `organization_participant`
- Еще нет записи в `memberships`

### SQL

```sql
-- db/migrations/32_create_missing_memberships.sql

-- Create membership for all participants who don't have one
INSERT INTO memberships (org_id, user_id, role, role_source)
SELECT DISTINCT
  p.org_id,
  p.user_id,
  'member' AS role,
  COALESCE(p.source, 'telegram_group') AS role_source
FROM participants p
WHERE 
  p.user_id IS NOT NULL
  AND p.participant_status IN ('participant', 'organization_participant')
  AND NOT EXISTS (
    SELECT 1 
    FROM memberships m 
    WHERE m.org_id = p.org_id 
      AND m.user_id = p.user_id
  )
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Log the result
DO $$
DECLARE
  inserted_count INT;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Created % missing memberships for existing participants', inserted_count;
END $$;

COMMENT ON TABLE memberships IS 'Stores organization membership with roles. Auto-created for participants during Telegram auth.';
```

### Применение

**В Supabase SQL Editor** (только после миграции 30!):

1. Откройте файл `db/migrations/32_create_missing_memberships.sql`
2. Скопируйте весь SQL
3. Вставьте в SQL Editor
4. Нажмите **Run**

**Ожидаемый вывод**:
```
Success. No rows returned
NOTICE: Created 12 missing memberships for existing participants
```

**Проверка**:
```sql
-- Проверка созданных memberships
SELECT 
  m.role,
  m.role_source,
  COUNT(*) AS count
FROM memberships m
GROUP BY m.role, m.role_source
ORDER BY m.role, m.role_source;

-- Должно быть примерно так:
-- role   | role_source    | count
-- -------+----------------+------
-- admin  | telegram_admin | 2
-- member | invite         | 3
-- member | telegram_group | 12
-- owner  | system         | 1
```

---

## Итоговая проверка

После применения всех миграций:

### 1. Проверка структуры

```sql
-- Проверка participants.user_id
SELECT 
  COUNT(*) AS total_participants,
  COUNT(user_id) AS with_user_id,
  COUNT(*) - COUNT(user_id) AS without_user_id
FROM participants
WHERE participant_status IN ('participant', 'organization_participant');
```

**Ожидается**: Большинство participants имеют `user_id`

### 2. Проверка memberships

```sql
-- Проверка, что все participants с user_id имеют membership
SELECT 
  p.id AS participant_id,
  p.full_name,
  p.tg_username,
  p.user_id,
  m.role,
  m.role_source
FROM participants p
LEFT JOIN memberships m ON m.org_id = p.org_id AND m.user_id = p.user_id
WHERE 
  p.participant_status IN ('participant', 'organization_participant')
  AND p.user_id IS NOT NULL
ORDER BY m.role IS NULL DESC, p.full_name;
```

**Ожидается**: Все записи имеют `m.role` и `m.role_source` (не NULL)

### 3. Тест авторизации

1. Авторизуйтесь как участник (через Telegram)
2. Откройте `/app/[org]`
3. **Ожидается**: доступ предоставлен, левое меню показывает 3 раздела ✅

---

## Что делать, если участники все еще без user_id

Если после миграции 30 у участников нет `user_id`, это означает:
- Они еще не авторизовались через Telegram
- Или нет записи в `user_telegram_accounts`

### Решение: Попросите участников авторизоваться заново

Обновленный код (`app/api/auth/telegram/route.ts`) автоматически:
1. Создаст или обновит `user_id` в `participants`
2. Создаст `membership` с `role='member'`

**Новая авторизация обновит все поля** ✅

---

## Troubleshooting

### Ошибка: "column p.user_id does not exist"

**Причина**: Миграция 30 не применена

**Решение**: Примените миграцию 30 **перед** миграцией 32

### Ошибка: "duplicate key value violates unique constraint"

**Причина**: Membership уже существует

**Решение**: Это нормально! `ON CONFLICT DO NOTHING` игнорирует дубликаты

### Участники не могут войти в организацию

**Проверка**:
```sql
SELECT 
  p.full_name,
  p.user_id,
  m.role
FROM participants p
LEFT JOIN memberships m ON m.user_id = p.user_id AND m.org_id = p.org_id
WHERE p.tg_username = 'YOUR_USERNAME';
```

**Если `user_id` NULL**:
- Участник должен авторизоваться заново через Telegram

**Если `user_id` есть, но `role` NULL**:
- Примените миграцию 32 снова
- Или создайте membership вручную:
  ```sql
  INSERT INTO memberships (org_id, user_id, role, role_source)
  VALUES ('YOUR_ORG_ID', 'USER_ID', 'member', 'telegram_group');
  ```

---

## Порядок файлов

| Файл | Описание | Статус |
|------|----------|--------|
| `30_add_user_id_to_participants.sql` | Добавляет `user_id` в `participants` | ⏳ Применить |
| `31_fix_sync_telegram_admins.sql` | Исправляет `sync_telegram_admins` | ✅ Применена |
| `32_create_missing_memberships.sql` | Создает `memberships` для существующих | ⏳ Применить (после 30) |

---

## Чеклист применения

- [ ] **Шаг 1**: Примените миграцию 30 (`add_user_id_to_participants.sql`)
- [ ] **Проверка 1**: Убедитесь, что колонка `user_id` создана
- [ ] **Проверка 2**: Убедитесь, что большинство participants имеют `user_id`
- [ ] **Шаг 2**: Миграция 31 уже применена ✅
- [ ] **Шаг 3**: Примените миграцию 32 (`create_missing_memberships.sql`)
- [ ] **Проверка 3**: Убедитесь, что создано N memberships
- [ ] **Тест**: Авторизуйтесь как участник и проверьте доступ

---

## Итоговая проверка работоспособности

### Успешное применение миграций

**Признаки**:
- ✅ Колонка `participants.user_id` существует
- ✅ Большинство participants имеют заполненный `user_id`
- ✅ Создано несколько записей в `memberships` с `role='member'`
- ✅ Участники могут войти в `/app/[org]`
- ✅ Левое меню показывает 3 раздела для members

**Если что-то не работает**:
- Проверьте Vercel Logs при авторизации
- Проверьте базу данных (SQL запросы выше)
- Попросите участников авторизоваться заново

---

**Версия**: 1.0  
**Автор**: AI Assistant  
**Последнее обновление**: 12.10.2025  
**Статус**: Готово к применению 🚀

