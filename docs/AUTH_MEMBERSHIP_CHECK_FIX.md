# Исправление проверки участия после авторизации

## Дата: 12.10.2025

## Проблема

После успешной авторизации через Telegram пользователь получает ошибку:

> **"Доступ ограничен. Это событие доступно только участникам пространства [название]. Вы авторизованы, но не являетесь участником этого пространства"**

Хотя пользователь переходил по ссылке из Telegram-группы, в которой состоит.

### Дополнительные симптомы

1. **SQL ошибка в Vercel Logs**:
   ```
   [error] Error syncing org admins: {
     code: '42702',
     message: 'column reference "user_id" is ambiguous'
   }
   ```

2. **Пользователь может зайти в другую организацию** с административным доступом (предыдущая сессия)

3. **В настройках организации**: "telegram не привязан"

---

## Анализ проблем

### Проблема 1: Проверка участия не находит записи

Логика проверки в `app/p/[org]/events/[id]/page.tsx`:

```typescript
if (userId) {
  const { data: telegramAccount } = await supabase
    .from('user_telegram_accounts')
    .select('telegram_user_id')
    .eq('user_id', userId)
    .eq('org_id', org.id)
    .maybeSingle()
  
  if (telegramAccount) {
    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('org_id', org.id)
      .eq('tg_user_id', telegramAccount.telegram_user_id)
      .maybeSingle()
    
    isOrgMember = !!participant
  }
}
```

**Возможные причины отсутствия `isOrgMember`**:

1. `user_telegram_accounts` не создан для этой `org_id`
2. `participant` не создан при авторизации
3. Разные `org_id` (пользователь авторизован для одной org, а проверяет другую)

### Проблема 2: SQL ambiguity в `sync_telegram_admins`

Функция из `db/migrations/20_org_settings_and_admins.sql` использует:

1. **Старую схему** `telegram_groups.org_id` (строка 75):
   ```sql
   WHERE tg.org_id = p_org_id
   ```
   
   Но `telegram_groups.org_id` больше не обновляется после перехода на `org_telegram_groups`!

2. **Ambiguous `user_id`** в нескольких местах:
   - Строка 69: `ugas.user_id`
   - Строка 82: `m.user_id`
   - Без явного указания таблицы → ошибка

---

## Решение

### Решение 1: Добавлено логирование и backup check

**Файл**: `app/p/[org]/events/[id]/page.tsx`

**Добавлено**:

1. **Детальное логирование**:
   ```typescript
   console.log(`[PublicEventPage] Checking membership for userId: ${userId}, orgId: ${org.id}`)
   console.log(`[PublicEventPage] telegramAccount:`, telegramAccount, 'error:', taError)
   console.log(`[PublicEventPage] participant:`, participant, 'error:', pError)
   console.log(`[PublicEventPage] Final isOrgMember: ${isOrgMember}`)
   ```

2. **Backup проверка по `user_id`**:
   ```typescript
   if (!telegramAccount) {
     // Try to find participant by user_id directly (backup check)
     const { data: directParticipant } = await supabase
       .from('participants')
       .select('id')
       .eq('org_id', org.id)
       .eq('user_id', userId)
       .maybeSingle()
     
     isOrgMember = !!directParticipant
   }
   ```

**Почему backup check**:
- Если `participants` имеет колонку `user_id`, можно проверить напрямую
- Не зависит от `user_telegram_accounts` (которая может отсутствовать)

### Решение 2: Исправлена SQL функция `sync_telegram_admins`

**Файл**: `db/migrations/30_fix_sync_telegram_admins.sql`

**Ключевые изменения**:

1. **Переход на `org_telegram_groups`** (вместо `telegram_groups.org_id`):
   ```sql
   FROM user_group_admin_status ugas
   INNER JOIN telegram_groups tg ON tg.tg_chat_id = ugas.tg_chat_id
   INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id  -- ✅ Новая схема
   WHERE 
     otg.org_id = p_org_id  -- ✅ Проверяем через org_telegram_groups
   ```

2. **Явные имена для устранения ambiguity**:
   ```sql
   WITH telegram_admins AS (
     SELECT DISTINCT
       ugas.user_id AS admin_user_id,  -- ✅ Явное имя
       ...
   ),
   current_admins AS (
     SELECT 
       m.user_id AS current_user_id,  -- ✅ Явное имя
       ...
   )
   ```

3. **Обновлены все ссылки**:
   ```sql
   LEFT JOIN current_admins ca ON ca.current_user_id = ta.admin_user_id  -- ✅
   WHERE ca.current_user_id IS NULL  -- ✅
   ...
   WHERE ta.admin_user_id = m.user_id  -- ✅
   ```

---

## Что будет в логах после исправления

### До исправления (❌):

**В Vercel Logs**:
```
[error] Error syncing org admins: {
  code: '42702',
  message: 'column reference "user_id" is ambiguous'
}
```

**Результат**: пользователь не может войти

### После исправления (✅):

**В Vercel Logs**:
```
[info] [PublicEventPage] Checking membership for userId: 8dd6c125-49c7-4970-a365-52eff536ce9c, orgId: d7e2e580-6b3d-42e2-bee0-4846794f07ee
[info] [PublicEventPage] telegramAccount: { telegram_user_id: 154588486 } error: null
[info] [PublicEventPage] participant: { id: 'abc123...' } error: null
[info] [PublicEventPage] Final isOrgMember: true
```

**Результат**: пользователь получает доступ ✅

### Если backup check сработал:

```
[info] [PublicEventPage] telegramAccount: null error: null
[info] [PublicEventPage] No telegram account found, checking participants directly
[info] [PublicEventPage] directParticipant: { id: 'abc123...' }
[info] [PublicEventPage] Final isOrgMember: true
```

---

## Применение миграции

### Шаг 1: Примените миграцию на production

**Через Supabase Dashboard**:

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое `db/migrations/30_fix_sync_telegram_admins.sql`
3. Вставьте и выполните

**Или через CLI** (если настроен):

```bash
supabase db push
```

### Шаг 2: Проверьте применение

```sql
-- Проверьте, что функция обновлена
SELECT pg_get_functiondef('sync_telegram_admins(uuid)'::regprocedure);

-- Должно показать новую версию с INNER JOIN org_telegram_groups
```

### Шаг 3: Передеплойте код

```bash
git add .
git commit -m "fix: membership check and sync_telegram_admins SQL"
git push
```

---

## Тестирование

### Сценарий 1: Проверка логов

1. Откройте Vercel Logs
2. Авторизуйтесь через Telegram на `/p/[org]/events/[id]`
3. Найдите логи `[PublicEventPage]`
4. Проверьте значения:
   - `userId` - должен быть UUID
   - `telegramAccount` - должен содержать `telegram_user_id` ИЛИ `null`
   - `participant` или `directParticipant` - должен содержать `id`
   - `isOrgMember` - должен быть `true`

### Сценарий 2: Проверка доступа

1. Откройте ссылку на событие из Telegram группы
2. Авторизуйтесь через Telegram
3. Ожидается: **доступ к событию предоставлен** ✅
4. НЕ должно быть "Вы авторизованы, но не являетесь участником"

### Сценарий 3: Проверка SQL ошибки

1. Откройте Vercel Logs
2. Найдите `Error syncing org admins`
3. Ожидается: **ошибки нет** ✅

---

## Дополнительная диагностика

### Если все еще "не являетесь участником"

**Проверьте в Vercel Logs**:

```
[info] [PublicEventPage] Checking membership...
[info] [PublicEventPage] telegramAccount: null
[info] [PublicEventPage] No telegram account found, checking participants directly
[info] [PublicEventPage] directParticipant: null
[info] [PublicEventPage] Final isOrgMember: false
```

**Если `telegramAccount: null` и `directParticipant: null`**:

Проверьте в БД:

```sql
-- 1. Проверьте user_telegram_accounts
SELECT * FROM user_telegram_accounts 
WHERE user_id = 'YOUR_USER_ID';

-- 2. Проверьте participants
SELECT * FROM participants 
WHERE user_id = 'YOUR_USER_ID' 
  OR tg_user_id = YOUR_TELEGRAM_ID;

-- 3. Проверьте активность в группах
SELECT * FROM telegram_activity_events 
WHERE from_user_id = YOUR_TELEGRAM_ID
  AND tg_chat_id IN (
    SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = 'ORG_ID'
  )
LIMIT 5;
```

**Если записи нет**:
- API `/api/auth/telegram` не создал `participant`
- Возможно, нет активности в `telegram_activity_events`
- Проверьте логи API во время авторизации

---

## Измененные файлы

| Файл | Изменения |
|------|-----------|
| `app/p/[org]/events/[id]/page.tsx` | Добавлено логирование и backup check по `user_id` |
| `db/migrations/30_fix_sync_telegram_admins.sql` | Исправлена SQL функция для `org_telegram_groups` и устранена ambiguity |
| `AUTH_MEMBERSHIP_CHECK_FIX.md` | Создана документация |

---

## Статус

✅ **Исправлено**  
📅 **Дата**: 12.10.2025  
🎯 **Добавлено логирование для диагностики**  
🔧 **Добавлен backup check по `user_id`**  
🗄️ **Исправлена SQL функция `sync_telegram_admins`**  
📊 **Ошибок компиляции**: Нет  
⚠️ **Требует**:  
  1. Применить миграцию `30_fix_sync_telegram_admins.sql`
  2. Передеплоить код
  3. Проверить логи при авторизации

---

**Версия**: 1.0  
**Автор**: AI Assistant  
**Последнее обновление**: 12.10.2025

