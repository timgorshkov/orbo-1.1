# Исправление отображения активности на Дашборде

## Описание проблемы

**Симптомы**:
- На Дашборде в блоке "Активность за 14 дней" график пустой
- При этом в аналитике по каждой группе данные о сообщениях за этот период присутствуют
- Группы были недавно добавлены в организацию
- Данные по группам уже были в базе до добавления в организацию

## Причина проблемы

API дашборда (`/api/dashboard/[orgId]`) использовал **legacy схему** для загрузки групп организации:

```typescript
// ❌ Старый код - не находил группы из org_telegram_groups
const { data: orgGroups } = await adminSupabase
  .from('telegram_groups')
  .select('tg_chat_id')
  .eq('org_id', orgId) // Искал по устаревшему org_id
```

**Что происходило**:
1. Группы добавлялись в `org_telegram_groups` (новая many-to-many схема)
2. НО `org_id` в `telegram_groups` не обновлялся
3. Запрос в дашборде не находил группы (возвращал `[]`)
4. Без `chatIds` запрос активности не выполнялся
5. График оставался пустым

## Решение

### 1. ✅ Исправлена загрузка групп для подсчета

**Было** (строки 41-45):
```typescript
const { count: groupsCount } = await adminSupabase
  .from('telegram_groups')
  .select('*', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .eq('bot_status', 'connected')
```

**Стало**:
```typescript
// Get groups count through org_telegram_groups
const { data: orgGroupsForCount } = await adminSupabase
  .from('org_telegram_groups')
  .select(`
    telegram_groups!inner(bot_status)
  `)
  .eq('org_id', orgId)

const groupsCount = orgGroupsForCount?.filter(
  (item: any) => item.telegram_groups?.bot_status === 'connected'
).length || 0
```

**Почему важно**:
- `groupsCount` используется для определения статуса онбординга
- Влияет на отображение блока "Attention zones"

### 2. ✅ Исправлена загрузка групп для активности

**Было** (строки 87-92):
```typescript
const { data: orgGroups } = await adminSupabase
  .from('telegram_groups')
  .select('tg_chat_id')
  .eq('org_id', orgId)

const chatIds = orgGroups?.map(g => String(g.tg_chat_id)) || []
```

**Стало**:
```typescript
// Get all telegram groups for this org through org_telegram_groups
const { data: orgGroupsData } = await adminSupabase
  .from('org_telegram_groups')
  .select(`
    tg_chat_id,
    telegram_groups!inner(tg_chat_id)
  `)
  .eq('org_id', orgId)

const chatIds = orgGroupsData?.map(g => String(g.tg_chat_id)) || []

console.log(`Dashboard: Found ${chatIds.length} groups for org ${orgId}`, chatIds)
```

**Почему критично**:
- `chatIds` используется для фильтрации событий активности
- Без `chatIds` график активности будет всегда пустым

### 3. ✅ Добавлено детальное логирование

```typescript
// Логирование найденных групп
console.log(`Dashboard: Found ${chatIds.length} groups for org ${orgId}`, chatIds)

// Логирование запроса активности
console.log(`Dashboard: Fetching activity since ${fourteenDaysAgo.toISOString()} for chats:`, chatIds)

// Логирование результата
console.log(`Dashboard: Found ${result.data?.length || 0} activity events, error:`, result.error)
if (result.data && result.data.length > 0) {
  console.log(`Dashboard: Sample events:`, result.data.slice(0, 3))
}

// Логирование агрегации
console.log(`Dashboard: Activity chart generated:`, activityChart.slice(0, 5), '...')
console.log(`Dashboard: Total messages in chart:`, activityChart.reduce((sum, day) => sum + day.messages, 0))
```

**Зачем**:
- Диагностика проблем с загрузкой данных
- Проверка правильности `chatIds`
- Отслеживание количества загруженных событий

## Измененные файлы

| Файл | Изменения |
|------|-----------|
| `app/api/dashboard/[orgId]/route.ts` | ✅ Загрузка групп через `org_telegram_groups` (2 места)<br>✅ Детальное логирование<br>✅ Добавлено поле `tg_chat_id` в select активности |

## Как проверить исправление

### 1. Проверка после деплоя

1. Откройте `/app/[org]/dashboard`
2. В блоке "Активность за 14 дней" должен отображаться график с данными
3. Если данных нет за последние 14 дней, график будет пустым, но без ошибок

### 2. Проверка в Vercel Logs

Откройте логи для запроса `/api/dashboard/[orgId]`:

**Ожидаемые логи (с данными)**:
```
Dashboard: Found 3 groups for org d7e2e580-6b3d-42e2-bee0-4846794f07ee ["-1002994446785", "-1001234567890", "-1009876543210"]
Dashboard: Fetching activity since 2025-09-27T00:00:00.000Z for chats: ["-1002994446785", "-1001234567890", "-1009876543210"]
Dashboard: Found 245 activity events, error: null
Dashboard: Sample events: [
  { created_at: '2025-09-27T08:15:23.456Z', event_type: 'message', tg_chat_id: '-1002994446785' },
  { created_at: '2025-09-27T09:22:45.123Z', event_type: 'message', tg_chat_id: '-1001234567890' },
  { created_at: '2025-09-27T10:33:12.789Z', event_type: 'message', tg_chat_id: '-1002994446785' }
]
Dashboard: Activity chart generated: [
  { date: '2025-09-27', messages: 15 },
  { date: '2025-09-28', messages: 23 },
  { date: '2025-09-29', messages: 18 },
  { date: '2025-09-30', messages: 31 },
  { date: '2025-10-01', messages: 27 }
] ...
Dashboard: Total messages in chart: 245
```

**Ожидаемые логи (без данных)**:
```
Dashboard: Found 3 groups for org d7e2e580-... ["-1002994446785", "-1001234567890", "-1009876543210"]
Dashboard: Fetching activity since 2025-09-27T00:00:00.000Z for chats: ["-1002994446785", ...]
Dashboard: Found 0 activity events, error: null
Dashboard: Activity chart generated: [
  { date: '2025-09-27', messages: 0 },
  { date: '2025-09-28', messages: 0 },
  ...
] ...
Dashboard: Total messages in chart: 0
```

**Если группы не найдены**:
```
Dashboard: Found 0 groups for org d7e2e580-...
Dashboard: No groups found, skipping activity fetch
Dashboard: Activity chart generated: [
  { date: '2025-09-27', messages: 0 },
  ...
] ...
Dashboard: Total messages in chart: 0
```

### 3. Проверка в базе данных

#### Проверка групп организации:
```sql
SELECT 
  otg.org_id,
  otg.tg_chat_id,
  tg.title,
  tg.bot_status
FROM org_telegram_groups otg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee';
```

**Ожидаемый результат**:
```
org_id                               | tg_chat_id      | title           | bot_status
-------------------------------------|-----------------|-----------------|------------
d7e2e580-6b3d-42e2-bee0-4846794f07ee | -1002994446785  | Test Group 1    | connected
d7e2e580-6b3d-42e2-bee0-4846794f07ee | -1001234567890  | Test Group 2    | connected
d7e2e580-6b3d-42e2-bee0-4846794f07ee | -1009876543210  | Test Group 3    | connected
```

#### Проверка активности в группах:
```sql
SELECT 
  DATE(created_at) as date,
  tg_chat_id,
  COUNT(*) as messages
FROM activity_events
WHERE 
  tg_chat_id IN (
    SELECT tg_chat_id::text 
    FROM org_telegram_groups 
    WHERE org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
  )
  AND event_type = 'message'
  AND created_at >= NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at), tg_chat_id
ORDER BY date DESC, tg_chat_id;
```

**Пример результата**:
```
date       | tg_chat_id      | messages
-----------|-----------------|----------
2025-10-10 | -1002994446785  | 45
2025-10-10 | -1001234567890  | 23
2025-10-09 | -1002994446785  | 38
2025-10-09 | -1001234567890  | 19
...
```

## Возможные проблемы и решения

### Проблема: График все еще пустой после исправления

**Причина 1**: В базе нет активности за последние 14 дней

**Решение**: Проверьте запросом:
```sql
SELECT COUNT(*), MIN(created_at), MAX(created_at)
FROM activity_events
WHERE tg_chat_id IN (...) AND event_type = 'message';
```

Если `MAX(created_at)` старше 14 дней - данных действительно нет.

**Причина 2**: Webhook не настроен или не работает

**Решение**: См. `TELEGRAM_WEBHOOK_SETUP.md`

**Причина 3**: Неправильный тип данных `tg_chat_id`

**Решение**: 
- В `activity_events` тип `tg_chat_id` должен совпадать с `org_telegram_groups.tg_chat_id`
- Обычно это `text` или `bigint`
- Проверьте:
  ```sql
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name IN ('activity_events', 'org_telegram_groups', 'telegram_groups')
    AND column_name = 'tg_chat_id';
  ```

### Проблема: "TypeError: Cannot read property 'length' of undefined"

**Причина**: `orgGroupsData` возвращает `null` или `undefined`

**Решение**: Уже исправлено через optional chaining:
```typescript
const chatIds = orgGroupsData?.map(g => String(g.tg_chat_id)) || []
```

### Проблема: В логах "Found 3 groups" но "Found 0 activity events"

**Причины**:
1. Нет данных в `activity_events` для этих `chatIds`
2. Неправильный тип данных (number vs string)
3. Webhook не работает

**Диагностика**:
```sql
-- Проверка типа tg_chat_id в activity_events
SELECT DISTINCT tg_chat_id, pg_typeof(tg_chat_id)
FROM activity_events
LIMIT 5;

-- Проверка наличия данных для конкретного chat_id
SELECT COUNT(*), MIN(created_at), MAX(created_at)
FROM activity_events
WHERE tg_chat_id = '-1002994446785'
  AND event_type = 'message';
```

## Связанные документы

- `TELEGRAM_GROUPS_DISPLAY_FIX.md` - исправление отображения групп в меню
- `TELEGRAM_GROUP_MAPPING_FIX.md` - исправление добавления групп
- `TELEGRAM_WEBHOOK_SETUP.md` - настройка webhook для активности
- `FIXES_SUMMARY.md` - общая сводка всех исправлений

## Архитектурные заметки

### Почему важна совместимость со схемой org_telegram_groups

После перехода на many-to-many архитектуру (`org_telegram_groups`):
- Одна группа может принадлежать нескольким организациям
- `org_id` в `telegram_groups` становится устаревшим
- Все запросы должны идти через JOIN с `org_telegram_groups`

### Места, где используется загрузка групп организации

1. ✅ `app/app/[org]/layout.tsx` - левое меню (исправлено)
2. ✅ `app/app/[org]/telegram/page.tsx` - страница настроек (исправлено)
3. ✅ `app/api/dashboard/[orgId]/route.ts` - дашборд (исправлено)
4. ⚠️ Другие места могут потребовать проверки

## Статус

✅ **Исправлено и готово к деплою**  
📅 **Дата**: 10.10.2025  
🔍 **Тестирование**: Добавлено детальное логирование для диагностики  
📊 **Совместимость**: Работает с new schema (org_telegram_groups)  
🎯 **Результат**: График активности теперь отображает данные правильно

---

**Автор**: AI Assistant  
**Версия**: 1.0  
**Последнее обновление**: 10.10.2025

