# Исправление ошибок статистики активности Telegram

## Обнаруженные проблемы

### 1. Ошибка: `column telegram_identities.full_name does not exist`

**Симптом**:
```
Error fetching telegram identities for analytics: {
  code: '42703',
  details: null,
  hint: null,
  message: 'column telegram_identities.full_name does not exist'
}
```

**Причина**: Код пытался получить данные из таблицы `telegram_identities`, которая либо не существует, либо не имеет колонки `full_name`.

**Исправление**: 
- Файл: `app/api/telegram/analytics/data/route.ts`
- Закомментирован блок кода, который пытался обогатить данные участников из таблицы `telegram_identities` (строки 386-429)
- Данные участников теперь берутся только из таблицы `participants`, которая имеет правильную структуру

---

### 2. Ошибка: `column reference "user_id" is ambiguous`

**Симптом**:
```
Error syncing org admins: {
  code: '42702',
  details: 'It could refer to either a PL/pgSQL variable or a table column.',
  hint: null,
  message: 'column reference "user_id" is ambiguous'
}
```

**Причина**: В функции `sync_telegram_admins` используется колонка `user_id` без явного указания таблицы, что приводит к неоднозначности когда несколько таблиц в JOIN имеют колонку с таким именем.

**Исправление**:
- Создана миграция: `db/migrations/37_fix_sync_telegram_admins_ambiguous.sql`
- Переписана функция `sync_telegram_admins` с явным указанием префиксов таблиц для всех колонок `user_id`
- Используется `m.user_id`, `uta.user_id`, `tao.user_id` вместо просто `user_id`

---

### 3. Сообщения не попадают в статистику активности

**Симптом**: 
- События активности в группах Telegram не записываются в таблицу `activity_events`
- Последние записи датированы несколькими днями назад
- Аналитика не показывает новые сообщения

**Возможные причины**:
1. Таблица `activity_events` может не иметь всех необходимых колонок (например, `thread_title`)
2. Код не доходит до вставки записей из-за ранних ошибок
3. Проблемы с правами доступа (RLS) при вставке

**Исправления**:
- Файл: `lib/services/eventProcessingService.ts`
- Добавлено подробное логирование на всех этапах обработки сообщений:
  - `[EventProcessing] ===== PROCESSING USER MESSAGE =====` - начало обработки
  - `[EventProcessing] ===== INSERTING ACTIVITY EVENT =====` - начало вставки
  - `[EventProcessing] ✅ Activity event recorded successfully` - успешная вставка
  - `[EventProcessing] ❌ Error inserting activity event` - ошибка вставки
- Удалена колонка `thread_title` из базового набора полей для совместимости
- Добавлен fallback на минимальный набор полей при ошибке вставки

---

## Действия для пользователя

### Шаг 1: Применить миграцию в базе данных

**Важно**: Выполните эту миграцию в Supabase SQL Editor:

```sql
-- Файл: db/migrations/37_fix_sync_telegram_admins_ambiguous.sql
-- Скопируйте и выполните содержимое этого файла в Supabase
```

Это исправит ошибку "column reference user_id is ambiguous".

### Шаг 2: Проверить структуру таблицы activity_events

Выполните в Supabase SQL Editor:

```sql
-- Проверка структуры таблицы activity_events
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'activity_events'
ORDER BY ordinal_position;
```

**Ожидаемые колонки**:
- `id` (SERIAL PRIMARY KEY)
- `org_id` (UUID)
- `event_type` (TEXT)
- `participant_id` (UUID)
- `tg_user_id` (BIGINT)
- `tg_chat_id` (BIGINT)
- `message_id` (BIGINT)
- `message_thread_id` (BIGINT)
- `reply_to_message_id` (BIGINT)
- `has_media` (BOOLEAN)
- `chars_count` (INTEGER)
- `links_count` (INTEGER)
- `mentions_count` (INTEGER)
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `meta` (JSONB)

**Если каких-то колонок не хватает**, выполните:

```sql
-- Файл: db/fix_activity_events.sql
-- Скопируйте и выполните содержимое этого файла в Supabase
```

### Шаг 3: Проверить политики RLS для activity_events

Выполните в Supabase SQL Editor:

```sql
-- Проверка политик RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'activity_events';
```

**Если политики отсутствуют или неправильные**, выполните:

```sql
-- Файл: db/fix_rls_policies.sql
-- Скопируйте и выполните содержимое этого файла в Supabase
```

Важно: Убедитесь, что есть политика `activity_events_insert_policy` с `WITH CHECK (true)`, чтобы разрешить вставку от сервисных ролей.

### Шаг 4: Мониторинг логов

После развертывания изменений:

1. Откройте Vercel Logs
2. Отправьте тестовое сообщение в одну из подключенных Telegram групп
3. Ищите в логах строки с префиксом `[EventProcessing]`:

**Успешная обработка должна выглядеть так**:
```
[EventProcessing] ===== PROCESSING USER MESSAGE =====
[EventProcessing] OrgId: dee0ecd3-9d2c-4277-b830-53421cff82bf
[EventProcessing] Message ID: 12345
[EventProcessing] Chat ID: -1002994446785
[EventProcessing] From: username
[EventProcessing] User message is valid, proceeding...
[EventProcessing] ===== INSERTING ACTIVITY EVENT =====
[EventProcessing] Attempting insert to activity_events...
[EventProcessing] ✅ Activity event recorded successfully with base data
```

**Если вы видите ошибки**:
```
[EventProcessing] ❌ Error inserting activity event with base data: { ... }
```
Скопируйте полный текст ошибки и отправьте для дальнейшей диагностики.

### Шаг 5: Проверка аналитики

1. Откройте страницу организации → Telegram Groups → выберите группу
2. Перейдите на вкладку "Аналитика"
3. Проверьте, что:
   - Количество сообщений увеличивается
   - График активности показывает новые данные
   - Список участников обновляется

---

## Отладка

### Если сообщения все еще не записываются

1. **Проверьте, что группа связана с организацией**:
```sql
SELECT tg.*, otg.org_id
FROM telegram_groups tg
LEFT JOIN org_telegram_groups otg ON otg.telegram_group_id = tg.id
WHERE tg.tg_chat_id = -1002994446785; -- замените на ваш chat_id
```

Если `org_id` = NULL, группа не связана с организацией и события не будут записываться.

2. **Проверьте, что webhook получает сообщения**:
Ищите в Vercel Logs строку `[Webhook] Step 2a: Running EventProcessingService for group chat`

3. **Проверьте количество записей в activity_events**:
```sql
SELECT 
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour,
  MAX(created_at) as last_event
FROM activity_events
WHERE tg_chat_id = -1002994446785; -- замените на ваш chat_id
```

---

## Файлы изменены

1. `app/api/telegram/analytics/data/route.ts` - закомментирован код работы с telegram_identities
2. `lib/services/eventProcessingService.ts` - добавлено логирование и улучшена вставка в activity_events
3. `db/migrations/37_fix_sync_telegram_admins_ambiguous.sql` - новая миграция для исправления sync_telegram_admins

---

## Статус исправлений

- ✅ **Ошибка telegram_identities.full_name** - исправлена
- ✅ **Ошибка "user_id is ambiguous"** - исправлена (требуется применение миграции)
- ✅ **Логирование для диагностики activity_events** - добавлено
- ⏳ **Запись activity_events** - требуется тестирование после применения миграций

---

## Следующие шаги

1. Примените миграцию 37
2. Проверьте структуру таблицы activity_events
3. Проверьте политики RLS
4. Отправьте тестовые сообщения в группы
5. Проверьте логи Vercel на наличие `[EventProcessing]` сообщений
6. Сообщите о результатах тестирования

