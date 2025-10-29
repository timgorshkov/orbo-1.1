# Руководство по удалению дублирующего пользователя

## Проблема

У вас есть два аккаунта в `auth.users` для одного физического пользователя Telegram (с одинаковым `telegram_user_id`).

**Пример:**
- Основной аккаунт (owner): `9bb4b601-fa85-44d4-a811-58bf0c889e93`
- Дублирующий (shadow admin): `d64f3cd8-093e-496a-868a-cf1bece66ee4`

Оба аккаунта связаны с множеством таблиц через foreign keys, что блокирует прямое удаление.

## Таблицы с Foreign Keys на auth.users

### Public Schema (наши таблицы):
- `memberships` - членство в организациях
- `participants` - участники групп
- `user_telegram_accounts` - связь с Telegram
- `organization_invite_uses` - использование инвайтов
- `telegram_verification_logs` - логи верификации
- `user_group_admin_status` - статус админа в группах

### Auth Schema (Supabase):
- `auth.identities` - провайдеры аутентификации
- `auth.sessions` - активные сессии
- `auth.mfa_factors` - MFA настройки
- `auth.one_time_tokens` - одноразовые токены
- `auth.oauth_authorizations` - OAuth авторизации (опционально)
- `auth.oauth_consents` - OAuth согласия (опционально)

## Процесс удаления

### Вариант 1: Полное удаление (force delete)

**Когда использовать:** Нужно полностью удалить дублирующий аккаунт и все его данные.

1. **Откройте Supabase SQL Editor**
2. **Выполните:** `db/force_delete_duplicate_user.sql`
3. **Результат:** Скрипт удалит все связи и попытается удалить пользователя

#### Возможные исходы:

**A. ✅ Успех:** 
```
✅✅✅ ПОЛЬЗОВАТЕЛЬ УСПЕШНО УДАЛЁН! ✅✅✅
```

**B. ⚠️ Недостаточно прав:**
```
⚠️ НЕДОСТАТОЧНО ПРАВ ДЛЯ УДАЛЕНИЯ
```
Переходите к [Ручному удалению через Dashboard](#ручное-удаление-через-dashboard)

**C. ❌ Foreign key violation:**
Скрипт не смог очистить все связи. Проверьте вывод и [повторите с дополнительными шагами](#дополнительная-диагностика).

### Вариант 2: Слияние аккаунтов (merge)

**Когда использовать:** Нужно сохранить данные обоих аккаунтов, объединив их в один.

1. **Откройте:** `db/merge_duplicate_telegram_users.sql`
2. **Настройте параметры** в начале файла:
   ```sql
   target_tg_user_id BIGINT := 154588486;
   primary_user_id UUID := '9bb4b601-fa85-44d4-a811-58bf0c889e93';  -- СОХРАНЯЕМ
   duplicate_user_id UUID := 'd64f3cd8-093e-496a-868a-cf1bece66ee4'; -- УДАЛЯЕМ
   target_org_id UUID := 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
   ```
3. **Выполните скрипт**
4. **После слияния** используйте Вариант 1 для удаления дубля

## Ручное удаление через Dashboard

Если SQL-скрипт не смог удалить пользователя из-за прав доступа:

### Способ 1: Supabase Dashboard (рекомендуется)

1. Откройте ваш проект в [Supabase Dashboard](https://supabase.com/dashboard)
2. Перейдите: **Authentication** → **Users**
3. Найдите пользователя по ID: `d64f3cd8-093e-496a-868a-cf1bece66ee4`
4. Нажмите на **три точки** справа → **Delete user**
5. Подтвердите удаление

### Способ 2: JavaScript/Node.js

Запустите скрипт `db/delete_user_via_api.js`:

```bash
# Установите переменные окружения
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJxxx..."

# Запустите скрипт
node db/delete_user_via_api.js
```

### Способ 3: cURL

```bash
curl -X DELETE \
  "https://YOUR_PROJECT.supabase.co/auth/v1/admin/users/d64f3cd8-093e-496a-868a-cf1bece66ee4" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

### Способ 4: Supabase Admin Client (в коде)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const { error } = await supabase.auth.admin.deleteUser(
  'd64f3cd8-093e-496a-868a-cf1bece66ee4'
)

if (error) {
  console.error('Error:', error)
} else {
  console.log('✅ User deleted!')
}
```

## Дополнительная диагностика

### Проверка остатков

После выполнения скриптов проверьте, что осталось:

```bash
# Запустите:
db/check_what_remains.sql
```

Этот скрипт покажет:
- Количество записей в каждой таблице для дублирующего user_id
- Список всех foreign keys на auth.users
- Состояние organization_admins после изменений

### Если остались связи

Если `check_what_remains.sql` показывает, что остались записи:

1. **Определите таблицу** с оставшимися записями
2. **Вручную удалите/обновите** эти записи:
   ```sql
   -- Пример: удаление из конкретной таблицы
   DELETE FROM table_name WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
   ```
3. **Повторите** попытку удаления пользователя

## Распространенные проблемы

### 1. "Database error loading user" в Dashboard

**Причина:** Остались записи в `auth.identities` или других таблицах `auth` schema.

**Решение:** 
- Запустите `force_delete_duplicate_user.sql` — он очистит эти таблицы
- Если не помогло, используйте API метод (скрипт `delete_user_via_api.js`)

### 2. "column user_id does not exist" в event_registrations

**Причина:** Таблица `event_registrations` использует `participant_id`, а не `user_id`.

**Решение:** Уже исправлено в обновленном скрипте `force_delete_duplicate_user.sql`

### 3. "insufficient_privilege" при удалении из auth schema

**Причина:** У текущего пользователя нет прав на изменение таблиц `auth` schema.

**Решение:** 
- Используйте Supabase Dashboard (он работает с правами суперпользователя)
- Или используйте Management API через Service Role Key

### 4. Пользователь удалился, но остался в organization_admins

**Причина:** `organization_admins` — это VIEW, который кэширует данные.

**Решение:** 
- Просто обновите страницу в браузере
- Или выполните: `REFRESH MATERIALIZED VIEW IF EXISTS organization_admins;` (если это materialized view)

## Финальная проверка

После успешного удаления проверьте:

```sql
-- 1. Пользователь удален из auth.users
SELECT * FROM auth.users WHERE id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
-- Ожидается: 0 строк

-- 2. Нет записей в organization_admins
SELECT * FROM organization_admins 
WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
-- Ожидается: 0 строк

-- 3. Владелец больше не дублируется
SELECT user_id, role, email, has_verified_telegram
FROM organization_admins
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END;
-- Ожидается: 1 owner, без дублей
```

## Превентивные меры

Чтобы избежать дублирования в будущем:

1. **Всегда проверяйте** наличие существующего `user_id` для `telegram_user_id` перед созданием нового пользователя
2. **Используйте транзакции** при создании связанных записей
3. **Добавьте UNIQUE constraint** на `telegram_user_id` в `user_telegram_accounts` (если еще нет)
4. **Логируйте** все операции создания пользователей для аудита

## Полезные команды

```sql
-- Найти все аккаунты для Telegram ID
SELECT u.id, u.email, u.created_at
FROM auth.users u
JOIN user_telegram_accounts uta ON uta.user_id = u.id
WHERE uta.telegram_user_id = 154588486;

-- Посмотреть все членства пользователя
SELECT org_id, role, created_at
FROM memberships
WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';

-- Посмотреть всех участников для user_id
SELECT id, org_id, full_name, tg_user_id, merged_into
FROM participants
WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
```

---

## Контрольный список

- [ ] Выполнен `force_delete_duplicate_user.sql` или `merge_duplicate_telegram_users.sql`
- [ ] Все связи удалены (проверено через `check_what_remains.sql`)
- [ ] Пользователь удален из `auth.users` (Dashboard/API)
- [ ] Проверено отсутствие дублей в `organization_admins`
- [ ] Финальная проверка показывает 0 записей для дублирующего user_id
- [ ] Приложение работает корректно (тестирование)


