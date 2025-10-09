# Исправление аналитики Telegram-групп

## Проблема

Аналитика телеграм-групп не работала, потому что:
1. События записывались только в `telegram_activity_events`
2. API аналитики читал данные из `activity_events`
3. Не было механизма синхронизации между этими таблицами

## Решение

Создан триггер и функция для автоматической синхронизации данных из `telegram_activity_events` в `activity_events`.

## Инструкция по применению

### Шаг 1: Применить миграцию SQL

Выполните скрипт `db/migrations/18_sync_telegram_activity.sql` в Supabase SQL Editor:

```bash
# В Supabase Dashboard:
1. Откройте SQL Editor
2. Скопируйте содержимое файла db/migrations/18_sync_telegram_activity.sql
3. Выполните скрипт
```

### Шаг 2: Проверить результаты

После выполнения скрипта вы увидите сообщение:
```
Синхронизация завершена:
  - Событий в telegram_activity_events: X
  - Событий в activity_events: Y
```

### Шаг 3: Проверить аналитику

1. Откройте страницу аналитики телеграм-группы
2. Убедитесь, что отображаются:
   - Метрики (количество сообщений, ответов, присоединений)
   - Топ активных участников
   - График активности
   - Список участников

## Что делает миграция

1. **Создает функцию `sync_telegram_activity_to_activity_events()`**
   - Автоматически копирует новые события из `telegram_activity_events` в `activity_events`
   - Получает `org_id` из `telegram_groups`
   - Получает `participant_id` из `participants`
   - Извлекает метаданные из JSON

2. **Создает триггер `trigger_sync_telegram_activity`**
   - Срабатывает при каждой вставке в `telegram_activity_events`
   - Автоматически вызывает функцию синхронизации

3. **Копирует исторические данные**
   - Переносит все существующие события из `telegram_activity_events` в `activity_events`
   - Избегает дублирования через `ON CONFLICT DO NOTHING`
   - Проверяет существование событий перед вставкой

4. **Создает оптимизирующие индексы**
   - Для запросов по `tg_chat_id` и `created_at`
   - Для запросов по `tg_user_id`
   - Для запросов по `event_type`

## Структура данных

### telegram_activity_events (источник)
- `tg_chat_id` - ID чата Telegram
- `identity_id` - ID пользователя в telegram_identities
- `tg_user_id` - ID пользователя Telegram
- `event_type` - Тип события (message, join, leave)
- `message_id` - ID сообщения
- `created_at` - Время события
- `meta` - JSON с дополнительными данными

### activity_events (назначение)
- `org_id` - ID организации
- `event_type` - Тип события
- `participant_id` - ID участника в системе
- `tg_user_id` - ID пользователя Telegram
- `tg_chat_id` - ID чата Telegram
- `message_id` - ID сообщения
- `has_media` - Наличие медиа
- `chars_count` - Количество символов
- `links_count` - Количество ссылок
- `mentions_count` - Количество упоминаний
- `created_at` - Время события
- `meta` - JSON с дополнительными данными

## Проверка работы триггера

Чтобы убедиться, что триггер работает:

```sql
-- 1. Проверить существование триггера
SELECT * FROM pg_trigger WHERE tgname = 'trigger_sync_telegram_activity';

-- 2. Проверить количество событий в обеих таблицах
SELECT 
  (SELECT COUNT(*) FROM telegram_activity_events) as telegram_events,
  (SELECT COUNT(*) FROM activity_events) as activity_events;

-- 3. Проверить последние синхронизированные события
SELECT 
  ae.id,
  ae.org_id,
  ae.event_type,
  ae.tg_user_id,
  ae.created_at
FROM activity_events ae
ORDER BY ae.created_at DESC
LIMIT 10;
```

## Откат (если нужно)

Если нужно отменить изменения:

```sql
-- Удалить триггер
DROP TRIGGER IF EXISTS trigger_sync_telegram_activity ON telegram_activity_events;

-- Удалить функцию
DROP FUNCTION IF EXISTS sync_telegram_activity_to_activity_events();

-- Очистить activity_events (ОСТОРОЖНО!)
-- TRUNCATE TABLE activity_events;
```

## Мониторинг

После применения миграции рекомендуется:

1. Проверять логи триггера на наличие ошибок
2. Сравнивать количество событий в обеих таблицах
3. Убедиться, что новые события автоматически попадают в `activity_events`

```sql
-- Сравнение количества событий за последний час
SELECT 
  'telegram_activity_events' as table_name,
  COUNT(*) as count
FROM telegram_activity_events
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'activity_events' as table_name,
  COUNT(*) as count
FROM activity_events
WHERE created_at > NOW() - INTERVAL '1 hour';
```

