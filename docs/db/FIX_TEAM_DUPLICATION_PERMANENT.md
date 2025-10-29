# Постоянное исправление дублирования администраторов

## 🎯 Цель
Предотвратить создание дублирующих `user_id` для одного и того же Telegram пользователя.

---

## 📋 План исправления

### 1️⃣ **Исправить функцию `sync_telegram_admins`**

**Проблема:** Функция ищет `user_id` только в текущей организации, создаёт shadow user даже если пользователь уже зарегистрирован.

**Решение:** Искать `user_id` **глобально** по `tg_user_id`:

```sql
CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
...
BEGIN
  FOR v_admin_record IN (...) LOOP
    
    -- ✅ НОВАЯ ЛОГИКА: Сначала ищем глобально
    
    -- Шаг 1: Ищем user_id в user_telegram_accounts (ГЛОБАЛЬНО)
    SELECT user_id INTO v_user_id
    FROM user_telegram_accounts
    WHERE telegram_user_id = v_admin_record.tg_user_id
      AND is_verified = true
    LIMIT 1;  -- Берём первый найденный
    
    -- Шаг 2: Если не нашли, ищем в participants (ГЛОБАЛЬНО)
    IF v_user_id IS NULL THEN
      SELECT user_id INTO v_user_id
      FROM participants
      WHERE tg_user_id = v_admin_record.tg_user_id
        AND merged_into IS NULL
        AND user_id IS NOT NULL
      LIMIT 1;
    END IF;
    
    -- Шаг 3: Только если НИГДЕ не нашли - создаём shadow user
    IF v_user_id IS NULL THEN
      -- Создаём shadow user только если нет НИКАКИХ следов этого tg_user_id
      ...
    ELSE
      -- ✅ Используем найденный user_id
      RAISE NOTICE 'Found existing user_id % for tg_user_id %', v_user_id, v_admin_record.tg_user_id;
    END IF;
    
    -- Создаём/обновляем membership для ЭТОЙ организации
    INSERT INTO memberships (org_id, user_id, role, ...)
    VALUES (p_org_id, v_user_id, ...)
    ON CONFLICT (org_id, user_id) DO UPDATE ...;
    
  END LOOP;
END;
$$;
```

### 2️⃣ **Создать helper-функцию для поиска user_id**

Централизовать логику поиска в одном месте:

```sql
CREATE OR REPLACE FUNCTION find_user_id_by_telegram(
  p_tg_user_id BIGINT
) RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Ищем в user_telegram_accounts (verified)
  SELECT user_id INTO v_user_id
  FROM user_telegram_accounts
  WHERE telegram_user_id = p_tg_user_id
    AND is_verified = true
  LIMIT 1;
  
  -- 2. Если не нашли, ищем в participants
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM participants
    WHERE tg_user_id = p_tg_user_id
      AND merged_into IS NULL
      AND user_id IS NOT NULL
    LIMIT 1;
  END IF;
  
  RETURN v_user_id;
END;
$$;
```

### 3️⃣ **Добавить защиту от дублей на уровне constraint**

Предотвратить на уровне БД:

```sql
-- Уникальный constraint: один tg_user_id = один user_id (глобально)
CREATE UNIQUE INDEX idx_user_telegram_accounts_unique_tg_user_id 
ON user_telegram_accounts(telegram_user_id) 
WHERE is_verified = true;

-- При попытке создать дубль - будет ошибка
```

**⚠️ Осторожно:** Это может сломать текущий код, если он пытается создавать дубли. Нужно сначала почистить существующие дубли.

### 4️⃣ **Обновить `telegramAuthService`**

Убедиться, что авторизация тоже использует ту же логику:

```typescript
export async function verifyTelegramAuthCode(params) {
  // ✅ УЖЕ РАБОТАЕТ ПРАВИЛЬНО: ищет глобально
  const existingAccount = await supabaseFetch(
    `user_telegram_accounts?telegram_user_id=eq.${telegramUserId}&select=user_id`
  );
  
  // Но добавим fallback на participants
  if (!existingAccount?.[0]) {
    const existingParticipant = await supabaseFetch(
      `participants?tg_user_id=eq.${telegramUserId}&user_id=neq.null&select=user_id`
    );
    
    if (existingParticipant?.[0]) {
      userId = existingParticipant[0].user_id;
      // Создаём user_telegram_accounts для этой организации
      ...
    }
  }
}
```

### 5️⃣ **Добавить автоматическую синхронизацию (опционально)**

Вместо ручных кнопок - автоматически синхронизировать:

**Вариант A:** После `update-admin-rights` автоматически вызывать `sync_telegram_admins`

```typescript
// app/api/telegram/groups/update-admin-rights/route.ts
export async function POST(request: Request) {
  // ... обновление telegram_group_admins ...
  
  // ✅ Автоматически синхронизируем
  const { data: syncResults } = await supabaseAdmin.rpc(
    'sync_telegram_admins',
    { p_org_id: orgId }
  );
  
  return { updated, total, synced: syncResults };
}
```

**Вариант B:** Cron job (каждый час):

```typescript
// app/api/cron/sync-admins/route.ts
export async function GET(request: NextRequest) {
  // Для всех организаций
  const { data: orgs } = await supabase.from('organizations').select('id');
  
  for (const org of orgs) {
    await supabaseAdmin.rpc('sync_telegram_admins', { p_org_id: org.id });
  }
  
  return { success: true };
}
```

---

## 🛠️ Миграция

**Файл:** `db/migrations/061_fix_sync_telegram_admins_global_search.sql`

```sql
-- Migration 61: Fix sync_telegram_admins to search user_id globally
-- Created: 2025-10-28
-- Purpose: Prevent duplicate user_id creation for same tg_user_id

-- 1. Создаём helper-функцию
CREATE OR REPLACE FUNCTION find_user_id_by_telegram(p_tg_user_id BIGINT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Ищем в user_telegram_accounts
  SELECT user_id INTO v_user_id
  FROM user_telegram_accounts
  WHERE telegram_user_id = p_tg_user_id
    AND is_verified = true
  LIMIT 1;
  
  -- Fallback: ищем в participants
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM participants
    WHERE tg_user_id = p_tg_user_id
      AND merged_into IS NULL
      AND user_id IS NOT NULL
    LIMIT 1;
  END IF;
  
  RETURN v_user_id;
END;
$$;

-- 2. Обновляем sync_telegram_admins
DROP FUNCTION IF EXISTS sync_telegram_admins(UUID);

CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(
  tg_user_id BIGINT,
  action TEXT,
  groups_count INTEGER,
  is_shadow BOOLEAN,
  full_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_record RECORD;
  v_participant RECORD;
  v_user_id UUID;
  v_existing_membership RECORD;
  v_has_email BOOLEAN;
BEGIN
  FOR v_admin_record IN (
    SELECT DISTINCT
      tga.tg_user_id,
      tga.user_telegram_account_id,
      ARRAY_AGG(DISTINCT tga.tg_chat_id) as tg_chat_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles,
      ARRAY_AGG(DISTINCT tga.custom_title) FILTER (WHERE tga.custom_title IS NOT NULL) as custom_titles,
      BOOL_OR(tga.is_owner) as is_owner
    FROM telegram_group_admins tga
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tga.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND tga.expires_at > NOW()
    GROUP BY tga.tg_user_id, tga.user_telegram_account_id
  ) LOOP
    
    -- ✅ НОВАЯ ЛОГИКА: Ищем user_id ГЛОБАЛЬНО
    v_user_id := find_user_id_by_telegram(v_admin_record.tg_user_id);
    
    IF v_user_id IS NULL THEN
      -- Только если НИГДЕ не нашли - создаём shadow user
      -- (Оставляем старую логику создания shadow user)
      ...
    ELSE
      -- ✅ Используем существующий user_id
      RAISE NOTICE 'Found existing user_id % for tg_user_id %', v_user_id, v_admin_record.tg_user_id;
      
      -- Проверяем email
      SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
      INTO v_has_email
      FROM auth.users
      WHERE id = v_user_id;
    END IF;
    
    -- Создаём/обновляем membership (как раньше)
    ...
    
  END LOOP;
  
  -- Удаление админов без прав (как раньше)
  ...
  
END;
$$;

COMMENT ON FUNCTION find_user_id_by_telegram IS 'Helper function to find user_id by telegram_user_id globally';
COMMENT ON FUNCTION sync_telegram_admins IS 'Sync admin roles from Telegram groups, now searches user_id globally';
```

---

## ✅ Проверка после миграции

1. **Запустить миграцию:**
```sql
-- Выполните: db/migrations/061_fix_sync_telegram_admins_global_search.sql
```

2. **Почистить существующие дубли:**
```sql
-- Запустите скрипты фикса для каждой организации:
-- db/fix_team_duplicates.sql (org1)
-- db/fix_team_duplicates_org2.sql (org2)
```

3. **Протестировать:**
   - Добавьте бота в новую группу
   - Нажмите "Обновить права администраторов"
   - Нажмите "Синхронизировать с Telegram"
   - Проверьте, что дублей НЕТ

4. **Проверить авторизацию:**
   - Авторизуйтесь через Telegram для доступа к материалам
   - Проверьте, что НЕ создаётся новый user_id

---

## 📊 Мониторинг

Запрос для проверки дублей в будущем:

```sql
-- Поиск дублей tg_user_id в разных user_id
SELECT 
  tg_user_id,
  COUNT(DISTINCT user_id) as user_ids_count,
  array_agg(DISTINCT user_id) as user_ids
FROM (
  SELECT telegram_user_id as tg_user_id, user_id
  FROM user_telegram_accounts
  WHERE is_verified = true
  
  UNION
  
  SELECT tg_user_id, user_id
  FROM participants
  WHERE user_id IS NOT NULL AND merged_into IS NULL
) combined
GROUP BY tg_user_id
HAVING COUNT(DISTINCT user_id) > 1
ORDER BY user_ids_count DESC;
```

Если этот запрос возвращает строки - есть дубли!

---

**Следующий шаг:** Выполните миграцию 061, затем запустите фикс-скрипты для очистки существующих дублей.


