# Исправление: Дубликаты участников при регистрации на события

## Проблема

При регистрации на событие создавался дубликат участника вместо использования существующего. В результате:
- У авторизованных пользователей создавался новый участник с `full_name = email`
- Накапливались дубликаты участников в организации
- Нарушалась целостность данных

## Причина

В коде `/api/events/[id]/register` использовалась **несуществующая таблица** `telegram_identities` для поиска связи `user_id → telegram_user_id`.

```typescript
// ❌ Неправильно - таблица не связана с auth.users
const { data: telegramIdentity } = await supabase
  .from('telegram_identities')  // Глобальная таблица без user_id
  .select('*')
  .eq('user_id', user.id)  // Поле не существует!
  .maybeSingle()
```

**Результат:** `telegramIdentity` всегда `null` → всегда создается новый участник.

---

## Архитектура таблиц

### 1. `telegram_identities` (глобальная)
- **Назначение:** Хранит информацию о Telegram пользователях глобально
- **Ключ:** `tg_user_id` (Telegram ID)
- **Нет связи с `auth.users`!**

```sql
CREATE TABLE telegram_identities (
  id UUID PRIMARY KEY,
  tg_user_id BIGINT UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  ...
)
```

### 2. `user_telegram_accounts` (связь с Supabase Auth)
- **Назначение:** Связывает `auth.users` с Telegram аккаунтами в контексте организации
- **Ключи:** `user_id` (Supabase), `telegram_user_id` (Telegram), `org_id`

```sql
CREATE TABLE user_telegram_accounts (
  user_id UUID REFERENCES auth.users,
  org_id UUID REFERENCES organizations,
  telegram_user_id BIGINT,
  ...
)
```

### 3. `participants` (участники организации)
- **Назначение:** Участники в контексте организации
- **Связь с Telegram:** через `tg_user_id`

```sql
CREATE TABLE participants (
  id UUID PRIMARY KEY,
  org_id UUID,
  tg_user_id BIGINT,  -- Telegram ID
  full_name TEXT,
  ...
)
```

---

## Решение

### Правильный flow поиска участника:

```
auth.users.id (Supabase)
    ↓
user_telegram_accounts.user_id + org_id
    ↓
user_telegram_accounts.telegram_user_id
    ↓
participants.tg_user_id + org_id
    ↓
participants.id ✅
```

### Обновленный код

```typescript
// ✅ Правильно - используем user_telegram_accounts
const { data: telegramAccount } = await supabase
  .from('user_telegram_accounts')
  .select('telegram_user_id')
  .eq('user_id', user.id)
  .eq('org_id', event.org_id)
  .maybeSingle()

let participant = null

// Найти участника по telegram_user_id
if (telegramAccount?.telegram_user_id) {
  const { data: foundParticipant } = await adminSupabase
    .from('participants')
    .select('id')
    .eq('org_id', event.org_id)
    .eq('tg_user_id', telegramAccount.telegram_user_id)
    .maybeSingle()

  participant = foundParticipant
}

// Создавать ТОЛЬКО если участник реально не найден
if (!participant) {
  console.log(`Creating new participant for user ${user.id} in org ${event.org_id}`)
  
  const { data: newParticipant } = await adminSupabase
    .from('participants')
    .insert({
      org_id: event.org_id,
      tg_user_id: telegramAccount?.telegram_user_id || null,
      full_name: user.email || 'Unknown',
      email: user.email,
      source: 'event',
      participant_status: 'event_attendee'
    })
    .select('id')
    .single()

  participant = newParticipant
}
```

---

## Что исправлено

### `POST /api/events/[id]/register`
- ✅ Используется `user_telegram_accounts` вместо `telegram_identities`
- ✅ Корректный поиск существующего участника
- ✅ Создание нового участника только если не найден
- ✅ Логирование создания для отладки

### `DELETE /api/events/[id]/register`
- ✅ Аналогичное исправление для отмены регистрации

---

## Тестирование

### Сценарий 1: Существующий участник регистрируется на событие

**Шаги:**
1. Пользователь авторизован через Telegram
2. Пользователь уже существует в таблице `participants` (через группу)
3. Пользователь регистрируется на событие

**Ожидаемый результат:**
- ✅ Найден существующий участник через `user_telegram_accounts → tg_user_id`
- ✅ Создана запись в `event_registrations` с существующим `participant_id`
- ❌ НЕ создан дубликат в `participants`

**Лог:**
```
Нет лога "Creating new participant" - участник найден
```

### Сценарий 2: Новый пользователь регистрируется на событие

**Шаги:**
1. Пользователь авторизован через Telegram
2. Пользователь НЕ существует в `participants` (не был в группах)
3. Пользователь регистрируется на событие

**Ожидаемый результат:**
- ✅ Не найден существующий участник
- ✅ Создан новый участник с:
  - `tg_user_id` из `user_telegram_accounts`
  - `source = 'event'`
  - `participant_status = 'event_attendee'`
- ✅ Создана запись в `event_registrations`

**Лог:**
```
Creating new participant for user [uuid] in org [org-uuid]
```

### Сценарий 3: Отмена регистрации

**Шаги:**
1. Пользователь зарегистрирован на событие
2. Пользователь отменяет регистрацию

**Ожидаемый результат:**
- ✅ Найден участник через `user_telegram_accounts`
- ✅ Статус регистрации изменен на `'cancelled'`
- ❌ Участник НЕ удален из `participants`

---

## Проверка дубликатов

### SQL для поиска дубликатов

```sql
-- Найти дубликаты по tg_user_id
SELECT 
  org_id, 
  tg_user_id, 
  COUNT(*) as count,
  STRING_AGG(full_name, ', ') as names
FROM participants
WHERE tg_user_id IS NOT NULL
GROUP BY org_id, tg_user_id
HAVING COUNT(*) > 1;

-- Найти участников, созданных через event с дубликатами
SELECT 
  p1.id,
  p1.org_id,
  p1.tg_user_id,
  p1.full_name,
  p1.source,
  p1.created_at
FROM participants p1
WHERE p1.source = 'event'
  AND EXISTS (
    SELECT 1 
    FROM participants p2 
    WHERE p2.org_id = p1.org_id 
      AND p2.tg_user_id = p1.tg_user_id 
      AND p2.id != p1.id
  )
ORDER BY p1.created_at DESC;
```

### Очистка существующих дубликатов

```sql
-- ВНИМАНИЕ: Запускать только после резервного копирования!

-- 1. Найти дубликаты и оставить старейшего
WITH duplicates AS (
  SELECT 
    id,
    org_id,
    tg_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, tg_user_id 
      ORDER BY created_at ASC
    ) as rn
  FROM participants
  WHERE tg_user_id IS NOT NULL
)
-- 2. Перенести регистрации на событие к основному участнику
UPDATE event_registrations
SET participant_id = (
  SELECT id FROM duplicates WHERE rn = 1 AND org_id = d.org_id AND tg_user_id = d.tg_user_id
)
FROM duplicates d
WHERE event_registrations.participant_id = d.id AND d.rn > 1;

-- 3. Удалить дубликаты
DELETE FROM participants
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
```

---

## Предотвращение в будущем

### 1. Добавить уникальный индекс (опционально)

```sql
-- Предотвратить создание дубликатов на уровне БД
CREATE UNIQUE INDEX participants_org_tg_user_unique
ON participants (org_id, tg_user_id)
WHERE tg_user_id IS NOT NULL;
```

⚠️ **Внимание:** Сначала очистите существующие дубликаты!

### 2. Логирование

В коде добавлено логирование создания участников:
```typescript
console.log(`Creating new participant for user ${user.id} in org ${event.org_id}`)
```

Мониторьте логи Vercel Functions - если видите частое создание, проверьте flow.

### 3. Тестирование

Добавьте E2E тест:
```typescript
test('should not create duplicate participant on event registration', async () => {
  // 1. Create participant
  const participant = await createParticipant(org_id, tg_user_id)
  
  // 2. Register for event
  await registerForEvent(event_id, user_id)
  
  // 3. Check no duplicates
  const participants = await getParticipants(org_id, tg_user_id)
  expect(participants.length).toBe(1)
})
```

---

## Дополнительные заметки

### Когда участник создается?

1. **Через Telegram группу** → `source = 'telegram'`
2. **Через событие** → `source = 'event'`, `participant_status = 'event_attendee'`
3. **Вручную админом** → `source = 'manual'`

### Статусы участников

- `participant` - обычный участник организации (в группе)
- `event_attendee` - зарегистрирован на событие, но не в группе
- `candidate` - кандидат
- `excluded` - исключен

### Миграция данных

Если у вас уже есть дубликаты:
1. Сделайте резервную копию БД
2. Запустите SQL очистки (см. выше)
3. Добавьте уникальный индекс
4. Задеплойте исправленный код

---

## Файлы

**Изменено:**
- `app/api/events/[id]/register/route.ts`

**Документация:**
- `EVENT_REGISTRATION_FIX.md` (этот файл)

---

**Дата:** 10.10.2025  
**Статус:** ✅ Исправлено  
**Критичность:** 🔴 Высокая (создание дубликатов)

