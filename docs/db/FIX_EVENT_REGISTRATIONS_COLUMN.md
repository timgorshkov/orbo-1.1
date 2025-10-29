# Исправление: event_registrations не имеет колонки user_id

## Проблема

При выполнении скриптов слияния/удаления дублирующих пользователей возникала ошибка:
```
ERROR: 42703: column "user_id" does not exist
QUERY: SELECT COUNT(*) FROM event_registrations WHERE user_id = dup_user_id
```

## Причина

Таблица `event_registrations` **не имеет прямой связи с `auth.users`** через колонку `user_id`.

### Актуальная схема таблицы:

```sql
CREATE TABLE event_registrations (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  participant_id UUID REFERENCES participants(id),  -- ✅ Используется participant_id
  org_id UUID REFERENCES organizations(id),
  status TEXT,
  qr_token TEXT,
  registered_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### Связь с пользователями:

```
auth.users (user_id)
    ↓
participants (user_id → id)
    ↓
event_registrations (participant_id)
```

## Решение

Вместо прямого обращения `WHERE user_id = ...` нужно использовать подзапрос через таблицу `participants`:

### Было (неправильно):
```sql
DELETE FROM event_registrations WHERE user_id = dup_user_id;
```

### Стало (правильно):
```sql
DELETE FROM event_registrations 
WHERE participant_id IN (
  SELECT id FROM participants WHERE user_id = dup_user_id
);
```

## Исправленные файлы

1. **`db/force_delete_duplicate_user.sql`** (строка 36)
   - Шаг 4: Удаление из event_registrations
   
2. **`db/check_what_remains.sql`** (строка 74)
   - Проверка количества записей

3. **`db/merge_duplicate_telegram_users.sql`**
   - Не требовал исправлений (не использует event_registrations)

## Тестирование

После исправления скрипты должны выполняться без ошибок:

```sql
-- Тест 1: Проверка количества
SELECT COUNT(*) 
FROM event_registrations 
WHERE participant_id IN (
  SELECT id FROM participants WHERE user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4'
);

-- Тест 2: Просмотр записей
SELECT er.*, p.full_name, p.user_id
FROM event_registrations er
JOIN participants p ON p.id = er.participant_id
WHERE p.user_id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
```

## Важно

При работе с таблицей `event_registrations` **всегда** используйте `participant_id` для связи с пользователями через таблицу `participants`. Прямой связи с `auth.users` в этой таблице нет.

## См. также

Полное руководство по удалению дублирующих пользователей: [`DELETE_DUPLICATE_USER_GUIDE.md`](./DELETE_DUPLICATE_USER_GUIDE.md)

