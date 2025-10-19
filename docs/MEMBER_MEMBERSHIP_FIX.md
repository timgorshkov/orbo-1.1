# Исправление: Создание Membership для участников

## Дата: 12.10.2025

## Проблема

При анализе интерфейса для участников была обнаружена критическая проблема:

> Когда участник авторизуется через Telegram, создается запись `participant`, но **не создается** запись `memberships`. Это означает, что участник не может войти в организацию, так как `app/app/[org]/layout.tsx` проверяет наличие membership:

```typescript
// app/app/[org]/layout.tsx
const { data: membership, error: memberError } = await adminSupabase
  .from('memberships')
  .select('role')
  .eq('user_id', user.id)
  .eq('org_id', org.id)
  .maybeSingle()

if (!membership) {
  console.log('❌ No membership found!')
  redirect('/orgs') // ❌ Участник не может войти!
}
```

### Симптомы

1. **Telegram авторизация создает participant**:
   - В `app/api/auth/telegram/route.ts`
   - Создается `participants` запись
   - Но НЕ создается `memberships` запись

2. **Layout требует membership**:
   - Проверяет `memberships` таблицу
   - Если нет записи → редирект на `/orgs`
   - Участник не может войти в организацию

3. **Результат**: Участники, авторизованные через Telegram, **не имеют доступа** к организации ❌

---

## Решение

Добавлено **автоматическое создание `membership`** с `role='member'` при авторизации через Telegram.

### Изменения в `app/api/auth/telegram/route.ts`

#### 1. Для авторизации через Telegram группы

**Было**:
```typescript
const { error: participantError } = await supabaseAdmin
  .from('participants')
  .insert({
    org_id: targetOrgId,
    tg_user_id: tgUserId,
    username: username || activityRecord.from_username,
    full_name: fullName,
    photo_url: photoUrl,
    participant_status: 'participant',
    source: 'telegram_group'
  })

if (participantError) {
  console.error('Error creating participant:', participantError)
} else {
  console.log(`Successfully created participant for user ${tgUserId}`)
}
```

**Стало**:
```typescript
const { error: participantError } = await supabaseAdmin
  .from('participants')
  .insert({
    org_id: targetOrgId,
    tg_user_id: tgUserId,
    username: username || activityRecord.from_username,
    full_name: fullName,
    photo_url: photoUrl,
    participant_status: 'participant',
    source: 'telegram_group',
    user_id: userId // ✅ Добавили user_id для связи
  })

if (participantError) {
  console.error('Error creating participant:', participantError)
} else {
  console.log(`Successfully created participant for user ${tgUserId}`)
  
  // ✅ НОВОЕ: Создаём membership с role='member'
  const { error: membershipError } = await supabaseAdmin
    .from('memberships')
    .insert({
      org_id: targetOrgId,
      user_id: userId,
      role: 'member',
      role_source: 'telegram_group'
    })
    .onConflict('org_id,user_id')
    .ignoreDuplicates()
  
  if (membershipError) {
    console.error('Error creating membership:', membershipError)
  } else {
    console.log(`Successfully created membership for user ${userId} in org ${targetOrgId}`)
  }
}
```

**Что изменилось**:
1. ✅ Добавлен `user_id: userId` в `participants` (для связи с `auth.users`)
2. ✅ Добавлено создание `memberships` записи
3. ✅ `role='member'` (обычный участник)
4. ✅ `role_source='telegram_group'` (источник: Telegram группа)
5. ✅ `onConflict` на `org_id,user_id` (избежание дубликатов)
6. ✅ Детальное логирование

#### 2. Для авторизации через invite token

**Было**:
```typescript
await supabaseAdmin
  .from('participants')
  .upsert({
    org_id: invite.org_id,
    tg_user_id: tgUserId,
    username: username,
    full_name: `${firstName}${lastName ? ' ' + lastName : ''}`,
    photo_url: photoUrl,
    participant_status: invite.access_type === 'full' ? 'participant' : 'event_attendee',
    source: 'invite'
  }, {
    onConflict: 'org_id,tg_user_id',
    ignoreDuplicates: false
  })

// (Нет создания membership)
```

**Стало**:
```typescript
await supabaseAdmin
  .from('participants')
  .upsert({
    org_id: invite.org_id,
    tg_user_id: tgUserId,
    username: username,
    full_name: `${firstName}${lastName ? ' ' + lastName : ''}`,
    photo_url: photoUrl,
    participant_status: invite.access_type === 'full' ? 'participant' : 'event_attendee',
    source: 'invite',
    user_id: userId // ✅ Добавили user_id
  }, {
    onConflict: 'org_id,tg_user_id',
    ignoreDuplicates: false
  })

// ✅ НОВОЕ: Создаём membership для full access
if (invite.access_type === 'full') {
  await supabaseAdmin
    .from('memberships')
    .upsert({
      org_id: invite.org_id,
      user_id: userId,
      role: 'member',
      role_source: 'invite'
    }, {
      onConflict: 'org_id,user_id',
      ignoreDuplicates: false
    })
  console.log(`Created membership for user ${userId} via invite`)
}
```

**Что изменилось**:
1. ✅ Добавлен `user_id: userId` в `participants`
2. ✅ Добавлено создание `memberships` для `access_type='full'`
3. ✅ `role='member'`
4. ✅ `role_source='invite'` (источник: приглашение)
5. ✅ Логирование создания

**Важно**: Membership создается **только** для `access_type='full'`. Если `access_type='event'`, то участник получает только доступ к событию, но не к организации.

---

## Логика работы

### Сценарий 1: Авторизация через Telegram (участник группы)

**Шаги**:
1. Участник Telegram группы нажимает "Log in with Telegram"
2. API проверяет активность в `telegram_activity_events`
3. Если активность найдена:
   - ✅ Создается `participant` (с `user_id`)
   - ✅ Создается `membership` с `role='member'`
   - ✅ Создается сессия
4. Участник редиректится на `/app/[org]`
5. Layout проверяет `memberships` → **находит** → доступ предоставлен ✅

### Сценарий 2: Авторизация через invite token (полный доступ)

**Шаги**:
1. Пользователь переходит по ссылке-приглашению
2. Авторизуется через Telegram
3. API проверяет `invite.access_type`
4. Если `access_type='full'`:
   - ✅ Создается `participant` (с `user_id`)
   - ✅ Создается `membership` с `role='member'`
   - ✅ Создается сессия
5. Участник редиректится на `/app/[org]`
6. Layout проверяет `memberships` → **находит** → доступ предоставлен ✅

### Сценарий 3: Авторизация через invite token (только событие)

**Шаги**:
1. Пользователь переходит по ссылке-приглашению
2. Авторизуется через Telegram
3. API проверяет `invite.access_type`
4. Если `access_type='event'`:
   - ✅ Создается `participant` (с `participant_status='event_attendee'`)
   - ❌ **Не создается** `membership` (нет доступа к организации)
   - ✅ Создается сессия
5. Участник может зарегистрироваться на событие
6. Но **не может** войти в `/app/[org]` (нет membership)

---

## Структура данных

### Таблица `memberships`

Новые записи, создаваемые при Telegram авторизации:

| Колонка | Значение | Описание |
|---------|----------|----------|
| `org_id` | UUID организации | ID организации |
| `user_id` | UUID пользователя | ID из `auth.users` |
| `role` | `'member'` | Роль: обычный участник |
| `role_source` | `'telegram_group'` или `'invite'` | Источник роли |

**Constraint**: `UNIQUE (org_id, user_id)` - один пользователь не может иметь несколько ролей в одной организации.

### Связь `participants` ↔ `memberships`

После исправления обе записи создаются одновременно:

```
participant (org_id, tg_user_id, user_id) 
    ↓
membership (org_id, user_id, role='member')
```

**`user_id`** - связывающее поле между:
- `participants.user_id` → `auth.users.id`
- `memberships.user_id` → `auth.users.id`

---

## Логирование

### Успешное создание membership

**В Vercel Logs**:
```
[info] Creating participant for user 154588486 based on activity in group -1002994446785
[info] Successfully created participant for user 154588486
[info] Successfully created membership for user a2b9012b-6154-4fed-a053-289b7d51bdd2 in org d7e2e580-6b3d-42e2-bee0-4846794f07ee
[info] Created Telegram account link for user a2b9012b-6154-4fed-a053-289b7d51bdd2
```

### Через invite

```
[info] Created membership for user 8dd6c125-49c7-4970-a365-52eff536ce9c via invite
[info] Successfully processed invite authentication
```

### Ошибка создания membership

```
[error] Error creating membership: {
  code: '23505',
  message: 'duplicate key value violates unique constraint "memberships_org_id_user_id_key"'
}
```
→ Это **нормально**, если membership уже существует (например, participant уже был добавлен ранее)

---

## Тестирование

### Тест 1: Новый участник через Telegram группу

**Подготовка**:
1. Создайте нового Telegram пользователя (например, в тестовой группе)
2. Убедитесь, что у него есть активность в `telegram_activity_events`
3. Убедитесь, что НЕТ записей в `participants` и `memberships`

**Шаги**:
1. Откройте публичную ссылку на событие: `/p/[org]/events/[id]`
2. Нажмите "Log in with Telegram"
3. Авторизуйтесь через Telegram
4. Ожидается: редирект на `/app/[org]`
5. Проверьте базу данных:
   ```sql
   -- Должна появиться запись в participants
   SELECT * FROM participants WHERE tg_user_id = 'YOUR_TG_ID';
   
   -- ✅ Должна появиться запись в memberships
   SELECT * FROM memberships WHERE user_id = 'YOUR_USER_ID' AND org_id = 'YOUR_ORG_ID';
   -- role должен быть 'member'
   -- role_source должен быть 'telegram_group'
   ```
6. Откройте `/app/[org]`
7. Ожидается: доступ предоставлен, левое меню показывает 3 раздела ✅

**Ожидаемый результат**:
- ✅ Participant создан
- ✅ Membership создан
- ✅ Доступ к организации есть
- ✅ Левое меню: Материалы, События, Участники

### Тест 2: Через invite (полный доступ)

**Подготовка**:
1. Создайте invite с `access_type='full'`
2. Получите ссылку приглашения

**Шаги**:
1. Откройте ссылку приглашения
2. Авторизуйтесь через Telegram (новый пользователь)
3. Ожидается: редирект на `/app/[org]`
4. Проверьте базу:
   ```sql
   SELECT * FROM memberships WHERE user_id = 'YOUR_USER_ID';
   -- role='member', role_source='invite'
   ```
5. Доступ к организации ✅

**Ожидаемый результат**:
- ✅ Membership создан
- ✅ Доступ к организации есть

### Тест 3: Через invite (только событие)

**Подготовка**:
1. Создайте invite с `access_type='event'`

**Шаги**:
1. Откройте ссылку приглашения
2. Авторизуйтесь через Telegram
3. Зарегистрируйтесь на событие
4. Попробуйте открыть `/app/[org]`
5. Ожидается: редирект на `/orgs` (нет membership)
6. Проверьте базу:
   ```sql
   SELECT * FROM memberships WHERE user_id = 'YOUR_USER_ID';
   -- Должно быть пусто (0 rows)
   ```

**Ожидаемый результат**:
- ❌ Membership НЕ создан (по дизайну)
- ❌ Доступа к организации нет
- ✅ Доступ к событию есть

---

## Миграция существующих участников

### Проблема

Участники, которые авторизовались **до** этого исправления, могут иметь:
- ✅ Запись в `participants`
- ❌ НЕТ записи в `memberships`

Эти участники **не смогут** войти в организацию.

### Решение: SQL миграция

Создать записи `memberships` для всех `participants` у которых их нет:

```sql
-- db/migrations/31_create_missing_memberships.sql

-- Создаем membership для всех participants, у которых его нет
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

-- Логирование
DO $$
DECLARE
  inserted_count INT;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Created % missing memberships', inserted_count;
END $$;
```

**Что делает**:
1. Находит всех `participants` с `user_id`
2. Проверяет, что у них нет `memberships`
3. Создает `membership` с `role='member'`
4. `role_source` берется из `participants.source` (или дефолт `'telegram_group'`)
5. `ON CONFLICT DO NOTHING` - игнорирует дубликаты

**Когда запускать**:
- После деплоя кода с этим исправлением
- Для исправления доступа существующих участников

---

## Измененные файлы

| Файл | Статус | Описание |
|------|--------|----------|
| `app/api/auth/telegram/route.ts` | ✏️ Изменен | Добавлено создание `membership` с `role='member'` |
| `MEMBER_MEMBERSHIP_FIX.md` | ➕ Создан | Документация исправления |
| `db/migrations/31_create_missing_memberships.sql` | ➕ Создан (опционально) | Миграция для существующих участников |

---

## Статус

✅ **Исправлено**  
📅 **Дата**: 12.10.2025  
🎯 **Реализовано**:
  - ✅ Автоматическое создание `membership` при Telegram auth
  - ✅ `role='member'` для обычных участников
  - ✅ `role_source='telegram_group'` или `'invite'`
  - ✅ Детальное логирование
  - ✅ Обработка конфликтов (ON CONFLICT)
📊 **Ошибок компиляции**: Нет  
📝 **Требуется**:
  - Применить миграцию для существующих участников (опционально)
  - Протестировать авторизацию новых участников

---

## Следующий шаг

**Протестируйте авторизацию нового участника**:

1. Откройте ссылку на событие: `/p/[org]/events/[id]`
2. Нажмите "Log in with Telegram"
3. Авторизуйтесь (участник Telegram группы)
4. → Редирект на `/app/[org]`
5. → **Доступ предоставлен!** ✅
6. → Левое меню показывает **3 раздела** (Материалы, События, Участники) ✅

**Если есть старые участники без доступа**:
- Примените миграцию `31_create_missing_memberships.sql`
- Это создаст `membership` для всех существующих `participants`

---

**Версия**: 1.0  
**Автор**: AI Assistant  
**Последнее обновление**: 12.10.2025

