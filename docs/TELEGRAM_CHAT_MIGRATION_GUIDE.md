# Руководство по миграции Telegram Chat ID

## Проблема

Когда Telegram группа получает права администратора и становится "supergroup", Telegram меняет её `chat_id`:
- **Старый формат:** `-4962287234` (обычная группа)
- **Новый формат:** `-1002855950299` (supergroup с префиксом `-100`)

Это приводит к дублированию записей в базе данных.

## Решение

### 1. Автоматическая миграция (рекомендуется)

При синхронизации групп система теперь **автоматически** определяет миграцию и переносит все данные:
- Нажмите кнопку "Обновить список групп" в `/app/[org]/telegram`
- Система определит дубль по названию группы
- Автоматически перенесёт все связанные данные

### 2. Ручная миграция через API

Если нужно мигрировать конкретную группу:

```bash
POST /api/telegram/groups/migrate-chat
Content-Type: application/json

{
  "oldChatId": -4962287234,
  "newChatId": -1002855950299
}
```

### 3. Ручная миграция через SQL

#### Шаг 1: Выполните миграцию функции

```sql
-- В Supabase SQL Editor выполните:
-- db/migrations/069_handle_chat_migration.sql
```

#### Шаг 2: Очистите конкретный дубль

Для группы "Do it, with Hegai😎":

```sql
-- Выполните в Supabase SQL Editor:
-- db/cleanup_duplicate_group_do_it_with_hegai.sql
```

Или используйте функцию напрямую:

```sql
SELECT migrate_telegram_chat_id(-4962287234, -1002855950299);
```

## Что переносится при миграции?

1. **Связи с организациями** (`org_telegram_groups`)
2. **Администраторы группы** (`telegram_group_admins`)
3. **Участники группы** (`participant_groups`)
4. **История активности** (`activity_events`)

Старая запись группы удаляется автоматически.

## Как проверить результат?

```sql
-- Проверить, что дубль удалён
SELECT * FROM telegram_groups 
WHERE title LIKE '%Do it, with Hegai%';

-- Должна остаться только одна запись с новым chat_id

-- Проверить историю миграций
SELECT * FROM telegram_chat_migrations 
ORDER BY migrated_at DESC;
```

## Логика детекции миграции

Система определяет миграцию по следующим признакам:
1. Две группы с **одинаковым названием**
2. Разные `chat_id`
3. Новый `chat_id` начинается с `-100`
4. Старый `chat_id` НЕ начинается с `-100`

## Обратная миграция

Если бот теряет права администратора и группа снова становится обычной:
- Telegram **не** меняет `chat_id` обратно
- Группа сохраняет supergroup `chat_id` с префиксом `-100`
- Дополнительных действий не требуется

## Таблица миграций

Все миграции логируются в таблицу `telegram_chat_migrations`:

```sql
CREATE TABLE telegram_chat_migrations (
  id SERIAL PRIMARY KEY,
  old_chat_id BIGINT NOT NULL,
  new_chat_id BIGINT NOT NULL,
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  migration_result JSONB,
  UNIQUE(old_chat_id, new_chat_id)
);
```

Результат миграции содержит:
- `success`: успешность миграции
- `moved_orgs`: количество перенесённых организаций
- `moved_admins`: количество перенесённых админов
- `moved_participants`: количество перенесённых участников
- `moved_activities`: количество перенесённых событий активности



