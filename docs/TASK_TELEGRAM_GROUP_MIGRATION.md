# Задача: Обработка миграции Telegram групп в супергруппы

## Проблема

Когда Telegram группа преобразуется в супергруппу (автоматически при достижении определённого размера или включении некоторых функций), Telegram меняет `chat_id` группы. Текущая реализация не обрабатывает это событие, что приводит к:

1. **Дублированию групп** в списке "Доступные группы"
2. **Потере истории активности** - старые события привязаны к старому `chat_id`
3. **Ошибкам при отправке сообщений** - бот пытается отправить в старый `chat_id`, который больше не существует

### Пример реальной ошибки

```json
{
  "level": "error",
  "group_id": 34,
  "group_title": "тест 6",
  "chat_id": -5020240850,
  "error_code": 400,
  "description": "Bad Request: group chat was upgraded to a supergroup chat",
  "msg": "[Events] Failed to send Telegram notification"
}
```

Группа `тест 6` была преобразована из обычной группы (`-5020240850`) в супергруппу (`-1003569294766`).

## Ожидаемое поведение

### Сценарий 1: Миграция существующей группы

**До миграции:**
- Группа "Мой чат" с `chat_id = -5020240850` привязана к организации
- В `activity_events` есть 1000 записей с этим `chat_id`
- В `group_metrics` есть данные за 30 дней

**Telegram отправляет update:**
```json
{
  "message": {
    "migrate_to_chat_id": -1003569294766,
    "chat": {
      "id": -5020240850,
      "title": "Мой чат"
    }
  }
}
```

**После обработки:**
- В `telegram_groups`:
  - Запись со старым `chat_id` помечена как `migrated_to = -1003569294766`
  - Создана/обновлена запись с новым `chat_id = -1003569294766`
- В `org_telegram_groups`: связь автоматически обновлена на новый `chat_id`
- В `telegram_group_admins`: записи обновлены на новый `chat_id`
- Отправка сообщений работает с новым `chat_id`
- История активности остаётся доступной (через связь `migrated_to`)

### Сценарий 2: Повторное добавление/удаление бота

**Действия пользователя:**
1. Добавил бота в группу → группа появилась в "Доступных"
2. Привязал группу к организации
3. Удалил бота из группы
4. Снова добавил бота в группу

**Ожидаемое поведение:**
- Группа **не дублируется** в списке
- При повторном добавлении бота - группа автоматически распознаётся как существующая
- Связь с организацией сохраняется (если не была удалена явно)

## Затрагиваемые таблицы

1. **`telegram_groups`** - основная таблица групп
2. **`org_telegram_groups`** - связь групп с организациями
3. **`telegram_group_admins`** - права админов в группах
4. **`activity_events`** - события активности (для исторических данных)
5. **`group_metrics`** - агрегированные метрики
6. **`telegram_chat_migrations`** - таблица для хранения истории миграций (уже существует, см. миграцию 69)

## План реализации

### Этап 1: Обработка события миграции в webhook

**Файл:** `app/api/telegram/webhook/route.ts` и `lib/services/eventProcessingService.ts`

1. Добавить обработку события `migrate_to_chat_id` в webhook:

```typescript
// В eventProcessingService.ts
async function handleGroupMigration(
  oldChatId: number,
  newChatId: number,
  logger: Logger
): Promise<void> {
  // 1. Записать миграцию в telegram_chat_migrations
  await supabaseAdmin
    .from('telegram_chat_migrations')
    .insert({
      old_chat_id: oldChatId,
      new_chat_id: newChatId,
      migrated_at: new Date().toISOString()
    });

  // 2. Обновить telegram_groups - пометить старую запись
  await supabaseAdmin
    .from('telegram_groups')
    .update({ 
      migrated_to: newChatId,
      bot_status: 'migrated'
    })
    .eq('tg_chat_id', oldChatId);

  // 3. Создать или обновить запись с новым chat_id
  const { data: existingNew } = await supabaseAdmin
    .from('telegram_groups')
    .select('id')
    .eq('tg_chat_id', newChatId)
    .maybeSingle();

  if (!existingNew) {
    // Копируем данные из старой записи
    const { data: oldGroup } = await supabaseAdmin
      .from('telegram_groups')
      .select('*')
      .eq('tg_chat_id', oldChatId)
      .single();

    if (oldGroup) {
      await supabaseAdmin
        .from('telegram_groups')
        .insert({
          ...oldGroup,
          id: undefined, // auto-generate
          tg_chat_id: newChatId,
          migrated_from: oldChatId,
          migrated_to: null,
          bot_status: oldGroup.bot_status === 'migrated' ? 'connected' : oldGroup.bot_status
        });
    }
  }

  // 4. Обновить org_telegram_groups
  await supabaseAdmin
    .from('org_telegram_groups')
    .update({ tg_chat_id: newChatId })
    .eq('tg_chat_id', oldChatId);

  // 5. Обновить telegram_group_admins
  await supabaseAdmin
    .from('telegram_group_admins')
    .update({ tg_chat_id: newChatId })
    .eq('tg_chat_id', oldChatId);

  logger.info({ 
    old_chat_id: oldChatId, 
    new_chat_id: newChatId 
  }, 'Group migration processed');
}
```

2. Вызвать обработчик при получении события:

```typescript
// В processUpdate или handleMessage
if (message?.migrate_to_chat_id) {
  await handleGroupMigration(
    message.chat.id,
    message.migrate_to_chat_id,
    logger
  );
  return; // Событие обработано
}
```

### Этап 2: Предотвращение дубликатов при добавлении групп

**Файл:** `app/api/telegram/groups/for-user/route.ts`

1. При выборке групп - исключать записи с `migrated_to IS NOT NULL`:

```typescript
const { data: groups } = await supabaseService
  .from('telegram_groups')
  .select('*')
  .in('tg_chat_id', chatIdValues)
  .is('migrated_to', null); // Исключаем мигрированные
```

2. Проверять `telegram_chat_migrations` при добавлении группы:

```typescript
// В add-to-org/route.ts - проверка перед добавлением
const { data: migration } = await supabaseService
  .from('telegram_chat_migrations')
  .select('new_chat_id')
  .eq('old_chat_id', tgChatId)
  .maybeSingle();

if (migration) {
  // Использовать новый chat_id вместо старого
  tgChatId = migration.new_chat_id;
}
```

### Этап 3: Fallback при ошибке отправки

**Файл:** `app/api/events/[id]/notify/route.ts` и другие места отправки сообщений

1. При ошибке "group chat was upgraded to a supergroup" - попробовать найти новый chat_id:

```typescript
if (telegramData.description?.includes('upgraded to a supergroup')) {
  // Попробовать найти новый chat_id
  const { data: migration } = await supabaseAdmin
    .from('telegram_chat_migrations')
    .select('new_chat_id')
    .eq('old_chat_id', chatId)
    .maybeSingle();

  if (migration?.new_chat_id) {
    // Повторить отправку с новым chat_id
    logger.info({ old_chat_id: chatId, new_chat_id: migration.new_chat_id }, 'Retrying with migrated chat_id');
    // ... retry logic
  }
}
```

### Этап 4: Миграция данных для аналитики (опционально)

**Отдельный cron job или ручной запуск**

Для сохранения консистентности аналитики можно обновить исторические данные:

```sql
-- Обновить activity_events (ВНИМАНИЕ: может быть много записей)
UPDATE activity_events ae
SET tg_chat_id = tcm.new_chat_id
FROM telegram_chat_migrations tcm
WHERE ae.tg_chat_id = tcm.old_chat_id;

-- Аналогично для group_metrics
UPDATE group_metrics gm
SET tg_chat_id = tcm.new_chat_id
FROM telegram_chat_migrations tcm
WHERE gm.tg_chat_id = tcm.old_chat_id;
```

⚠️ **Важно:** Эту миграцию лучше делать после основной реализации и тестирования.

## Миграция БД (если нужна)

Таблица `telegram_chat_migrations` уже существует (миграция 69). Нужно добавить колонку `migrated_to` в `telegram_groups`:

```sql
-- migrations/XXX_add_migrated_to_column.sql
ALTER TABLE telegram_groups 
ADD COLUMN IF NOT EXISTS migrated_to bigint REFERENCES telegram_groups(tg_chat_id),
ADD COLUMN IF NOT EXISTS migrated_from bigint;

-- Индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_telegram_groups_migrated_to 
ON telegram_groups(migrated_to) WHERE migrated_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_groups_migrated_from 
ON telegram_groups(migrated_from) WHERE migrated_from IS NOT NULL;
```

## Тестирование

### Ручное тестирование

1. Создать тестовую группу в Telegram
2. Добавить бота и привязать к организации
3. Записать несколько сообщений (для истории)
4. Преобразовать группу в супергруппу (включить Topics или добавить >200 участников)
5. Проверить:
   - Группа не дублируется в списке
   - Публикация событий работает
   - История активности сохранилась

### Автоматические тесты

```typescript
describe('Group Migration', () => {
  it('should handle migrate_to_chat_id event', async () => {
    // Setup: create group with old chat_id
    // Send migration event
    // Assert: old group marked as migrated
    // Assert: new group created
    // Assert: org_telegram_groups updated
  });

  it('should prevent duplicates for migrated groups', async () => {
    // Setup: group already migrated
    // Action: try to add old chat_id to org
    // Assert: uses new chat_id instead
  });

  it('should retry with new chat_id on upgrade error', async () => {
    // Setup: send message to old chat_id
    // Mock Telegram API to return "upgraded" error
    // Assert: retry with new chat_id
    // Assert: message sent successfully
  });
});
```

## Приоритет реализации

1. **Критично (сейчас):** Обработка `migrate_to_chat_id` в webhook
2. **Критично (сейчас):** Исключение мигрированных групп из списка
3. **Важно:** Fallback при ошибке отправки
4. **Желательно:** Миграция исторических данных

## Связанные файлы

- `app/api/telegram/webhook/route.ts` - точка входа webhook
- `lib/services/eventProcessingService.ts` - обработка событий
- `app/api/telegram/groups/for-user/route.ts` - список групп
- `app/api/telegram/groups/add-to-org/route.ts` - добавление группы
- `app/api/events/[id]/notify/route.ts` - отправка уведомлений
- `lib/services/telegramService.ts` - Telegram API wrapper
- `docs/TELEGRAM_CHAT_MIGRATION_GUIDE.md` - существующая документация

---

## ✅ РЕАЛИЗАЦИЯ ЗАВЕРШЕНА (2025-12-19)

### Созданные/изменённые файлы:

#### Миграция БД
- `db/migrations/151_fix_telegram_groups_duplicates.sql`
  - Функция `merge_duplicate_telegram_groups()` для очистки дубликатов
  - Уникальный индекс `idx_telegram_groups_tg_chat_id_unique`
  - Колонки `migrated_to` / `migrated_from`
  - Обновлённая функция `migrate_telegram_chat_id()`
  - Хелпер `resolve_telegram_chat_id()`

#### Webhook
- `app/api/telegram/webhook/route.ts`
  - Обработка `migrate_to_chat_id` и `migrate_from_chat_id`
  - Upsert с `onConflict: 'tg_chat_id'`

#### API Endpoints
- `app/api/telegram/groups/add-to-org/route.ts` — резолв миграции
- `app/api/telegram/groups/for-user/route.ts` — фильтрация мигрированных групп
- `app/api/telegram/groups/sync/route.ts` — upsert с обработкой конфликтов
- `app/api/telegram/groups/migrate-chat/route.ts` — upsert для записи миграций

#### Cron Job
- `app/api/cron/sync-admin-rights/route.ts`
  - Автоматическая миграция при ошибке "upgraded to supergroup"
  - Получение `migrated_to_chat_id` через `getChat` API

### Следующий шаг:
Применить миграцию `151_fix_telegram_groups_duplicates.sql` через Supabase Dashboard → SQL Editor.

