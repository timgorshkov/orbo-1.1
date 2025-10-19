# Исправление отображения Telegram групп в левом меню

## Описание проблемы

После успешного добавления Telegram группы в организацию:
- ✅ Добавление проходит без ошибок
- ✅ Группа исчезает из списка доступных групп
- ❌ **Группа НЕ появляется в левом меню**
- ❌ **Группа НЕ отображается на странице `/app/[org]/telegram`**

## Причина проблемы

### Архитектура системы

В системе используется **two-table architecture** для Telegram групп:

1. **`telegram_groups`** - основная таблица с информацией о группах:
   - `id` (primary key)
   - `tg_chat_id` (Telegram chat ID)
   - `title`, `bot_status`, etc.
   - `org_id` (deprecated - для обратной совместимости)

2. **`org_telegram_groups`** - таблица связей (many-to-many):
   - `org_id` → organizations
   - `tg_chat_id` → telegram_groups
   - Позволяет одной группе принадлежать нескольким организациям

### Проблема

При добавлении группы создается запись в `org_telegram_groups`:

```typescript
await supabaseService
  .from('org_telegram_groups')
  .insert({
    org_id: orgId,
    tg_chat_id: tgChatIdStr,
    created_by: user.id
  });
```

**НО** код для отображения групп в левом меню использовал старую схему:

```typescript
// ❌ Старый код - не находит группы из org_telegram_groups
const { data: groups } = await adminSupabase
  .from('telegram_groups')
  .select('id, tg_chat_id, title, bot_status')
  .eq('org_id', org.id) // Ищет по устаревшему org_id в telegram_groups
  .order('title', { ascending: true })
```

Поскольку мы **не обновляли** `org_id` в `telegram_groups` (только добавляли в `org_telegram_groups`), запрос не находил добавленные группы.

## Решение

### 1. ✅ Исправлен `app/app/[org]/layout.tsx`

Изменен запрос для загрузки групп через JOIN с `org_telegram_groups`:

```typescript
// ✅ Новый код - использует org_telegram_groups
const { data: orgGroups, error: groupsError } = await adminSupabase
  .from('org_telegram_groups')
  .select(`
    telegram_groups (
      id,
      tg_chat_id,
      title,
      bot_status
    )
  `)
  .eq('org_id', org.id)

if (orgGroups && !groupsError) {
  // Извлекаем telegram_groups из результата JOIN
  telegramGroups = orgGroups
    .map(item => item.telegram_groups)
    .filter(group => group !== null)
    .sort((a: any, b: any) => {
      const titleA = a.title || ''
      const titleB = b.title || ''
      return titleA.localeCompare(titleB)
    })
}
```

**Как работает**:
1. Загружаем записи из `org_telegram_groups` для текущей организации
2. Через Supabase JOIN получаем связанные записи из `telegram_groups`
3. Извлекаем и сортируем группы по названию

### 2. ✅ Исправлен `app/app/[org]/telegram/page.tsx`

Аналогично изменен запрос для страницы настроек Telegram:

```typescript
// ✅ Новый код - использует org_telegram_groups с !inner
const { data: orgGroupsData, error: orgGroupsError } = await supabase
  .from('org_telegram_groups')
  .select(`
    telegram_groups!inner (
      id,
      tg_chat_id,
      title,
      invite_link,
      bot_status,
      last_sync_at
    )
  `)
  .eq('org_id', params.org)

if (orgGroupsData && !orgGroupsError) {
  groups = (orgGroupsData as any[])
    .map((item: any) => item.telegram_groups as TelegramGroup)
    .filter((group: TelegramGroup | null): group is TelegramGroup => group !== null)
    .sort((a, b) => (a.id || 0) - (b.id || 0)) as TelegramGroup[]
}
```

**Особенности**:
- `!inner` - гарантирует, что вернутся только записи с существующей связанной группой
- Type casting `as any[]` и `as TelegramGroup` - для корректной работы с TypeScript
- Фильтрация `null` значений на случай отсутствия связанной группы

## Измененные файлы

| Файл | Изменения |
|------|-----------|
| `app/app/[org]/layout.tsx` | ✅ Загрузка групп через `org_telegram_groups` (JOIN) |
| `app/app/[org]/telegram/page.tsx` | ✅ Загрузка групп через `org_telegram_groups` (JOIN с `!inner`) |

## Как проверить исправление

### 1. Проверка после деплоя

1. Откройте `/app/[org]/telegram/available-groups`
2. Нажмите "Добавить в организацию" для любой группы
3. Дождитесь сообщения "Группа успешно добавлена в организацию!"
4. Вы будете перенаправлены на `/app/[org]/telegram`
5. **Ожидаемый результат**:
   - ✅ Группа появляется в левом меню под "TELEGRAM ГРУППЫ"
   - ✅ Группа отображается на странице настроек Telegram

### 2. Проверка в Vercel Logs

**Layout.tsx логи**:
```
=== OrgLayout START ===
orgId: d7e2e580-6b3d-42e2-bee0-4846794f07ee
user: a2b9012b-6154-4fed-a053-289b7d51bdd2
Fetching organization...
org: { id: '...', name: '...', logo_url: '...' }
Fetching membership for user: a2b9012b-... org: d7e2e580-...
✅ Membership found, role: owner
Fetching telegram groups for org: d7e2e580-...
orgGroups: [ { telegram_groups: { id: 10, tg_chat_id: '-1002994446785', title: 'Test Group', bot_status: 'connected' } } ]
Loaded telegram groups: 1
=== OrgLayout SUCCESS ===
```

### 3. Проверка в базе данных

Убедитесь, что группа есть в `org_telegram_groups`:

```sql
SELECT 
  otg.org_id,
  otg.tg_chat_id,
  otg.created_at,
  tg.title,
  tg.bot_status
FROM org_telegram_groups otg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee';
```

**Ожидаемый результат**:
```
org_id                               | tg_chat_id      | created_at           | title      | bot_status
-------------------------------------|-----------------|----------------------|------------|------------
d7e2e580-6b3d-42e2-bee0-4846794f07ee | -1002994446785  | 2025-10-10 12:00:00  | Test Group | connected
```

## SQL для миграции существующих данных (опционально)

Если у вас есть группы с заполненным `org_id` в `telegram_groups`, но без записей в `org_telegram_groups`:

```sql
-- Создать записи в org_telegram_groups для всех групп с org_id
INSERT INTO org_telegram_groups (org_id, tg_chat_id, created_at)
SELECT 
  org_id,
  tg_chat_id,
  created_at
FROM telegram_groups
WHERE org_id IS NOT NULL
ON CONFLICT (org_id, tg_chat_id) DO NOTHING;

-- Проверка результата
SELECT 
  COUNT(*) as total_mappings,
  COUNT(DISTINCT org_id) as unique_orgs,
  COUNT(DISTINCT tg_chat_id) as unique_groups
FROM org_telegram_groups;
```

## Возможные проблемы и решения

### Проблема: "Cannot read properties of null (reading 'telegram_groups')"

**Причина**: Supabase JOIN возвращает `null` для `telegram_groups`, если связанная запись не найдена.

**Решение**: Используйте `!inner` для гарантии наличия связанной записи:
```typescript
.select('telegram_groups!inner (...)') // !inner исключает null значения
```

Или добавьте фильтрацию:
```typescript
.filter(group => group !== null)
```

### Проблема: Группы не появляются после обновления страницы

**Причина**: Кэширование Next.js.

**Решение**: Добавлен `router.refresh()` в `available-groups/page.tsx` перед редиректом:
```typescript
router.refresh() // Обновляет данные на сервере
setTimeout(() => {
  router.push(`/app/${params.org}/telegram`)
}, 500)
```

### Проблема: TypeScript ошибки при маппинге

**Причина**: Supabase типы не всегда корректно определяют структуру JOIN.

**Решение**: Используйте type casting:
```typescript
(orgGroupsData as any[])
  .map((item: any) => item.telegram_groups as TelegramGroup)
```

## Связанные документы

- `TELEGRAM_GROUPS_AVAILABILITY_FIX.md` - исправление отображения доступных групп
- `TELEGRAM_GROUP_MAPPING_FIX.md` - исправление ошибки добавления групп
- `APPLY_MIGRATION_06.md` - инструкция по миграции (опционально)
- `FIXES_SUMMARY.md` - общая сводка всех исправлений

## Архитектурные заметки

### Преимущества new_schema (org_telegram_groups)

1. **Many-to-Many**: Одна группа может принадлежать нескольким организациям
2. **Гибкость**: Легко добавлять/удалять связи без изменения основных записей
3. **Аудит**: Можно хранить `created_by`, `created_at` для каждой связи
4. **Статусы**: Миграция 06 добавляет `status`, `archived_at` для мягкого удаления

### Legacy поддержка

Поле `org_id` в `telegram_groups` сохранено для обратной совместимости, но **не используется** в новом коде. Все новые функции должны работать через `org_telegram_groups`.

## Статус

✅ **Исправлено и готово к деплою**  
📅 **Дата**: 10.10.2025  
🔍 **Тестирование**: Добавлено логирование в layout.tsx  
📊 **Совместимость**: Работает с new_schema (org_telegram_groups)

---

**Автор**: AI Assistant  
**Версия**: 1.0  
**Последнее обновление**: 10.10.2025

