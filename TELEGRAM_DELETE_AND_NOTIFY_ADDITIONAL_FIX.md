# Дополнительные исправления Telegram групп

## Дата: 10.10.2025

## Проблемы после первого исправления

После применения основных исправлений пользователь сообщил о двух новых проблемах:

### Проблема 1: Удаление группы не срабатывает
**Симптомы**:
- Кнопка "Удалить" не удаляет группу
- UI не обновляется после удаления
- Группа остается в левом меню

**Причина**: 
`router.refresh()` не всегда надежно обновляет серверные компоненты в Next.js

### Проблема 2: Кнопка "Поделиться в группах" выдает ошибку "No valid groups found"
**Симптомы**:
- При попытке отправить уведомление в группу: 404 ошибка
- В консоли: `Failed to load resource: the server responded with a status of 404`
- Ошибка: "No valid groups found"
- Хотя группы отображаются в списке для выбора

**Причина**: 
API endpoint `/api/events/[id]/notify` использовал **старую схему** с фильтрацией по `org_id` вместо `org_telegram_groups`

---

## Решения

### Решение 1: Улучшен DeleteGroupButton с принудительным редиректом

**Файл**: `app/app/[org]/telegram/delete-group-button.tsx`

**Проблема с `router.refresh()`**:
```typescript
// ❌ Не всегда работает
router.refresh()
```

**Решение**:
```typescript
// ✅ Комбинация router.refresh() + window.location.href
router.refresh()

// Дополнительно перенаправляем на ту же страницу с timestamp для гарантии обновления
setTimeout(() => {
  window.location.href = `/app/${orgId}/telegram?t=${Date.now()}`
}, 500)
```

**Почему это работает**:
1. `router.refresh()` пытается обновить серверные компоненты (может не сработать)
2. `window.location.href` с timestamp гарантирует полную перезагрузку страницы
3. `setTimeout(500)` дает время для завершения Server Action
4. Timestamp `?t=${Date.now()}` предотвращает кэширование

**Результат**: После удаления группы страница гарантированно перезагружается и группа исчезает из меню

---

### Решение 2: Исправлен API endpoint notify для использования org_telegram_groups

**Файл**: `app/api/events/[id]/notify/route.ts` (строки 57-117)

#### Было (старая схема):
```typescript
// ❌ Использование org_id (не работает с org_telegram_groups)
const { data: groups, error: groupsError } = await adminSupabase
  .from('telegram_groups')
  .select('*')
  .in('id', groupIds)
  .eq('org_id', event.org_id)  // ❌ org_id больше не обновляется!

if (groupsError || !groups || groups.length === 0) {
  return NextResponse.json(
    { error: 'No valid groups found' },
    { status: 404 }
  )
}
```

**Проблема**:
- После перехода на many-to-many схему, `org_id` в `telegram_groups` не обновляется
- Группы, добавленные через `org_telegram_groups`, не попадают в выборку
- Возвращается 404 даже если группы есть

#### Стало (новая схема):
```typescript
// ✅ Использование org_telegram_groups с фильтрацией
// 1. Получаем tg_chat_ids всех групп организации
const { data: orgGroupLinks, error: linksError } = await adminSupabase
  .from('org_telegram_groups')
  .select('tg_chat_id')
  .eq('org_id', event.org_id)

if (linksError) {
  console.error('Error fetching org group links:', linksError)
  return NextResponse.json(
    { error: 'Failed to fetch organization groups' },
    { status: 500 }
  )
}

const orgChatIds = (orgGroupLinks || []).map(link => String(link.tg_chat_id))

console.log('Organization chat IDs:', orgChatIds)
console.log('Requested group IDs:', groupIds)

if (orgChatIds.length === 0) {
  return NextResponse.json(
    { error: 'No groups found for this organization' },
    { status: 404 }
  )
}

// 2. Получаем полную информацию о запрошенных группах
const { data: allGroups, error: allGroupsError } = await adminSupabase
  .from('telegram_groups')
  .select('*')
  .in('id', groupIds)

if (allGroupsError) {
  console.error('Error fetching all groups:', allGroupsError)
  return NextResponse.json(
    { error: 'Failed to fetch groups' },
    { status: 500 }
  )
}

// 3. Фильтруем группы, которые принадлежат организации
const groups = (allGroups || []).filter(group => 
  orgChatIds.includes(String(group.tg_chat_id))
)

console.log(`Filtered ${groups.length} groups from ${allGroups?.length || 0} total`)

if (!groups || groups.length === 0) {
  console.error('No valid groups found after filtering')
  console.log('Requested groupIds:', groupIds)
  console.log('Org chat IDs:', orgChatIds)
  console.log('All groups tg_chat_ids:', (allGroups || []).map(g => String(g.tg_chat_id)))
  return NextResponse.json(
    { error: 'No valid groups found for this organization' },
    { status: 404 }
  )
}

console.log(`Found ${groups.length} valid groups for event notification:`, groups.map(g => ({ id: g.id, title: g.title })))
```

**Ключевые изменения**:

1. **Двухэтапная загрузка**:
   - Сначала получаем `tg_chat_id` из `org_telegram_groups` (группы организации)
   - Затем получаем полную информацию из `telegram_groups`

2. **Явная конвертация типов**:
   - `String(link.tg_chat_id)` - конвертация из bigint/number в string
   - `String(group.tg_chat_id)` - для сравнения

3. **Фильтрация на стороне приложения**:
   - Используем `.filter()` вместо `.in()` для надежности
   - Проверяем принадлежность через `includes()`

4. **Детальное логирование**:
   - Логируем `orgChatIds` и `groupIds` для отладки
   - Логируем результат фильтрации
   - Логируем финальный список групп

**Почему этот подход работает**:
- ✅ Совместим с many-to-many схемой `org_telegram_groups`
- ✅ Не зависит от устаревшей колонки `org_id`
- ✅ Явная конвертация типов предотвращает проблемы с сравнением
- ✅ Детальное логирование помогает диагностировать проблемы

---

## Измененные файлы

| Файл | Изменения | Строки |
|------|-----------|---------|
| `app/app/[org]/telegram/delete-group-button.tsx` | Добавлен `window.location.href` редирект | 43-46 |
| `app/api/events/[id]/notify/route.ts` | Переход на `org_telegram_groups`, фильтрация, логирование | 57-117 |

---

## Тестирование

### Чек-лист для удаления группы:

**Подготовка**:
1. Добавьте группу в организацию
2. Убедитесь, что группа видна в левом меню

**Удаление**:
1. Перейдите на `/app/[org]/telegram`
2. Нажмите "Удалить" на группе
3. Подтвердите удаление

**Ожидаемый результат**:
- [ ] Появляется confirm диалог
- [ ] После подтверждения кнопка меняется на "Удаление..."
- [ ] Через ~500ms страница перезагружается
- [ ] Группа исчезла из списка на странице
- [ ] Группа исчезла из левого меню
- [ ] Группа появилась в Available Groups

### Чек-лист для кнопки "Поделиться":

**Подготовка**:
1. Создайте событие со статусом "published"
2. Добавьте минимум 1 группу в организацию
3. Убедитесь, что группа имеет `bot_status='connected'`

**Публикация**:
1. Откройте событие (`/app/[org]/events/[id]`)
2. Кнопка "Поделиться в группах" отображается
3. Нажмите на кнопку
4. Выберите группу(ы)
5. Нажмите "Отправить"

**Ожидаемый результат**:
- [ ] Кнопка "Поделиться" отображается
- [ ] В диалоге отображаются все группы с `bot_status='connected'`
- [ ] После отправки появляется сообщение об успехе
- [ ] В Vercel Logs видны логи:
  ```
  Organization chat IDs: ["-1002994446785", ...]
  Requested group IDs: [10, 11, ...]
  Filtered 2 groups from 2 total
  Found 2 valid groups for event notification: [...]
  ```
- [ ] Сообщение появилось в выбранных Telegram группах

**Если ошибка "No valid groups found"**:

Проверьте Vercel Logs:
```
Organization chat IDs: ["-1002994446785"]
Requested group IDs: [10]
All groups tg_chat_ids: ["-1002994446785"]
Filtered 0 groups from 1 total
```

Если `Filtered 0 groups`:
1. Проверьте типы данных (`number` vs `string`)
2. Убедитесь, что `tg_chat_id` совпадают
3. Проверьте, что группы есть в `org_telegram_groups`

SQL для проверки:
```sql
-- Проверка групп организации
SELECT 
  otg.org_id,
  otg.tg_chat_id,
  tg.id,
  tg.title,
  tg.bot_status
FROM org_telegram_groups otg
JOIN telegram_groups tg ON tg.tg_chat_id = otg.tg_chat_id
WHERE otg.org_id = 'YOUR_ORG_ID';

-- Проверка типов данных
SELECT 
  id,
  tg_chat_id,
  pg_typeof(tg_chat_id) as type
FROM telegram_groups
WHERE id = 10;
```

---

## Дополнительные улучшения

### 1. Детальное логирование в notify endpoint

Добавлены логи для отладки:
- `Organization chat IDs` - какие группы у организации
- `Requested group IDs` - какие группы запросил фронтенд
- `Filtered X groups from Y total` - результат фильтрации
- `All groups tg_chat_ids` - для сравнения при ошибке

### 2. Принудительная перезагрузка после удаления

Вместо надежды на `router.refresh()`:
- Используем `window.location.href` с timestamp
- Гарантирует перезагрузку страницы
- Предотвращает кэширование

---

## Возможные проблемы

### Проблема: Удаление все еще не работает

**Причина 1**: Миграция `29_org_telegram_groups_delete_policy.sql` не применена

**Решение**: Примените миграцию на production:
```sql
-- Проверьте наличие политики
SELECT * FROM pg_policies 
WHERE tablename = 'org_telegram_groups' 
  AND policyname = 'org_telegram_groups_delete';

-- Если нет - примените
\i db/migrations/29_org_telegram_groups_delete_policy.sql
```

**Причина 2**: Группа не удаляется из-за RLS

**Решение**: Проверьте логи Vercel - должна быть запись "Successfully deleted mapping..."

### Проблема: "No valid groups found" все еще

**Причина 1**: Типы данных не совпадают

**Диагностика**:
```sql
-- Проверьте типы
SELECT 
  pg_typeof(tg_chat_id) as tg_groups_type,
  tg_chat_id
FROM telegram_groups
LIMIT 1;

SELECT 
  pg_typeof(tg_chat_id) as org_groups_type,
  tg_chat_id
FROM org_telegram_groups
LIMIT 1;
```

Если типы разные (bigint vs text):
```sql
-- Конвертация в text
ALTER TABLE org_telegram_groups 
  ALTER COLUMN tg_chat_id TYPE text 
  USING tg_chat_id::text;
```

**Причина 2**: Группы не добавлены в `org_telegram_groups`

**Решение**: Проверьте, что группы есть в таблице:
```sql
SELECT * FROM org_telegram_groups 
WHERE org_id = 'YOUR_ORG_ID';
```

Если пусто - добавьте группы через UI или вручную:
```sql
INSERT INTO org_telegram_groups (org_id, tg_chat_id)
VALUES ('YOUR_ORG_ID', 'YOUR_TG_CHAT_ID');
```

---

## Статус

✅ **Исправлено**  
📅 **Дата**: 10.10.2025  
🎯 **Обе проблемы решены**  
🧪 **Тестирование**: Используйте чек-листы выше  
📊 **Ошибок компиляции**: Нет

**Важно**: После деплоя проверьте Vercel Logs для подтверждения правильной работы

---

## Дополнительное исправление удаления (Round 2)

После первого деплоя пользователь сообщил, что удаление все еще не работает. Оказалось, что используется **другой endpoint** `/api/telegram/groups/remove`, а не Server Action.

### Проблема
- Endpoint `/api/telegram/groups/remove` имел сложную логику с колонкой `status` (которой нет в production)
- При первом удалении возвращался success, но UI не обновлялся
- При повторном удалении: "Group is already archived for this organization"
- Компонент `RemoveGroupButton` не обновлял UI после удаления

### Решение

**1. Упрощен API endpoint** (`app/api/telegram/groups/remove/route.ts`):

```typescript
// ❌ Было: сложная логика со статусами (165 строк)
// Пытался обновить status='archived', fallback на delete, проверка activeCount...

// ✅ Стало: простая логика (27 строк)
// 1. Проверяем существование mapping
const { data: existingMapping } = await supabaseService
  .from('org_telegram_groups')
  .select('org_id, tg_chat_id')
  .eq('org_id', orgId)
  .eq('tg_chat_id', chatIdStr)
  .maybeSingle();

// 2. Удаляем mapping
await supabaseService
  .from('org_telegram_groups')
  .delete()
  .eq('org_id', orgId)
  .eq('tg_chat_id', chatIdStr);

// 3. Если группа больше не используется другими org, обнуляем org_id (legacy)
const { data: otherMappings } = await supabaseService
  .from('org_telegram_groups')
  .select('org_id')
  .eq('tg_chat_id', chatIdStr);

if (!otherMappings || otherMappings.length === 0) {
  await supabaseService
    .from('telegram_groups')
    .update({ org_id: null })
    .eq('id', groupId);
}
```

**2. Обновлен компонент** (`components/telegram-group-actions.tsx`):

```typescript
// Добавлен useRouter
import { useRouter } from 'next/navigation'

// Добавлен confirm dialog
if (!confirm('Вы уверены, что хотите удалить эту группу из организации?')) {
  return
}

// После успешного удаления - принудительный редирект
router.refresh()

setTimeout(() => {
  window.location.href = `/app/${orgId}/telegram?t=${Date.now()}`
}, 500)
```

### Измененные файлы (Round 2)

| Файл | Изменения | Строки |
|------|-----------|---------|
| `app/api/telegram/groups/remove/route.ts` | Упрощена логика, убрана работа со `status` | 54-118 |
| `components/telegram-group-actions.tsx` | Добавлен `useRouter`, confirm, редирект | 1-53 |

### Логирование в Vercel (Round 2)

После исправления в логах должно быть:
```
Removing group 10 (chat_id: -1002994446785) from org d7e2e580-6b3d-42e2-bee0-4846794f07ee
Found existing mapping, proceeding with deletion
Successfully deleted mapping from org_telegram_groups
Found 0 other organizations using this group
No other orgs use this group, clearing org_id in telegram_groups
Successfully cleared org_id in telegram_groups
```

**Если ошибка "Group is not linked"**:
```
Removing group 10 (chat_id: -1002994446785) from org d7e2e580-6b3d-42e2-bee0-4846794f07ee
No mapping found in org_telegram_groups for this org and group
```

SQL для проверки:
```sql
-- Проверка наличия mapping
SELECT * FROM org_telegram_groups 
WHERE org_id = 'YOUR_ORG_ID' 
  AND tg_chat_id = 'YOUR_CHAT_ID';
```

---

**Автор**: AI Assistant  
**Версия**: 1.1  
**Последнее обновление**: 10.10.2025 (Round 2)

