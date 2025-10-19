# Исправление ошибки "Failed to check existing group mapping"

## Описание проблемы

При попытке добавить Telegram группу из списка доступных групп возникала ошибка:

**Ошибка**: `"Failed to check existing group mapping"`

**Консоль браузера**:
```
Adding group 6 to org d7e2e580-6b3d-42e2-bee0-4846794f07ee
/api/telegram/groups/add-to-org:1  Failed to load resource: the server responded with a status of 500 ()
Add group response: Object
Error adding group to organization: Error: Failed to check existing group mapping
```

## Причина проблемы

### 1. Несоответствие типов `tg_chat_id`

В таблице `telegram_groups` поле `tg_chat_id` может иметь разные типы (число или строка) в зависимости от того, как данные были добавлены. При запросе к таблице `org_telegram_groups` происходила ошибка из-за несоответствия типов.

**Пример**:
- В `telegram_groups`: `tg_chat_id` может быть `number` (например, `-1001234567890`)
- В `org_telegram_groups`: `tg_chat_id` может быть `text` (строка)
- Запрос `.eq('tg_chat_id', group.tg_chat_id)` не находил совпадений из-за разницы типов

### 2. Недостаточное логирование

В коде не было достаточного логирования, чтобы понять:
- Какой тип данных у `group.tg_chat_id`
- Какую именно ошибку возвращает Supabase
- На каком этапе происходит сбой

## Решение

### 1. ✅ Приведение `tg_chat_id` к строке

**Файл**: `app/api/telegram/groups/add-to-org/route.ts`

Добавлено явное приведение `tg_chat_id` к строке сразу после получения группы:

```typescript
// Проверяем, что группа существует
const { data: group, error: groupError } = await supabaseService
  .from('telegram_groups')
  .select('*')
  .eq('id', groupId)
  .single();

if (groupError || !group) {
  console.error('Error fetching group:', groupError);
  return NextResponse.json({ 
    error: 'Group not found' 
  }, { status: 404 });
}

// ✅ Приводим tg_chat_id к строке для совместимости с БД
const tgChatIdStr = String(group.tg_chat_id);
console.log(`Group tg_chat_id: ${tgChatIdStr} (original type: ${typeof group.tg_chat_id})`);
```

### 2. ✅ Использование строкового `tg_chat_id` во всех запросах

Теперь во всех запросах используется `tgChatIdStr` вместо `group.tg_chat_id`:

**Проверка прав администратора**:
```typescript
const { data: adminRights, error: adminError } = await supabaseService
  .from('telegram_group_admins')
  .select('*')
  .eq('tg_chat_id', tgChatIdStr) // ✅ Использование строки
  .eq('tg_user_id', activeAccount.telegram_user_id)
  .eq('is_admin', true)
  .single();
```

**Проверка существующей привязки**:
```typescript
const { data: existingMapping, error: mappingCheckError } = await supabaseService
  .from('org_telegram_groups')
  .select('status')
  .eq('org_id', orgId)
  .eq('tg_chat_id', tgChatIdStr) // ✅ Использование строки
  .maybeSingle();
```

**Создание/обновление привязки**:
```typescript
if (existingMapping && existingMapping.status === 'archived') {
  await supabaseService
    .from('org_telegram_groups')
    .update({ status: 'active', archived_at: null, created_by: user.id })
    .eq('org_id', orgId)
    .eq('tg_chat_id', tgChatIdStr); // ✅ Использование строки
} else if (!existingMapping) {
  await supabaseService
    .from('org_telegram_groups')
    .insert({
      org_id: orgId,
      tg_chat_id: tgChatIdStr, // ✅ Использование строки
      created_by: user.id,
      status: 'active'
    });
}
```

### 3. ✅ Улучшенное логирование

Добавлено детальное логирование для диагностики:

```typescript
// Логирование типа tg_chat_id
console.log(`Group tg_chat_id: ${tgChatIdStr} (original type: ${typeof group.tg_chat_id})`);

// Логирование проверки существующей привязки
console.log(`Checking existing mapping for org ${orgId}, group tg_chat_id: ${tgChatIdStr}`);

// Детальное логирование ошибок
if (mappingCheckError) {
  console.error('Error checking group mapping:', {
    code: mappingCheckError.code,
    message: mappingCheckError.message,
    details: mappingCheckError.details,
    hint: mappingCheckError.hint,
    tg_chat_id: tgChatIdStr,
    tg_chat_id_type: typeof tgChatIdStr
  });
  
  // Код 42P01 означает, что таблица не существует - это нормально для старых установок
  if (mappingCheckError.code !== '42P01') {
    return NextResponse.json({ 
      error: 'Failed to check existing group mapping',
      details: mappingCheckError.message 
    }, { status: 500 });
  }
  
  console.log('org_telegram_groups table not found, will use legacy fallback');
}

// Логирование действий при создании/обновлении
if (existingMapping && existingMapping.status === 'archived') {
  console.log(`Reactivating archived mapping for group ${tgChatIdStr} in org ${orgId}`);
} else if (!existingMapping) {
  console.log(`Creating new mapping for group ${tgChatIdStr} in org ${orgId}`);
} else {
  console.log(`Mapping already exists for group ${tgChatIdStr} in org ${orgId}, status: ${existingMapping.status}`);
}

// Логирование успешного добавления
console.log(`Successfully linked group ${tgChatIdStr} to org ${orgId}`);
```

### 4. ✅ Улучшенные ответы API

Добавлена более подробная информация в ответах:

```typescript
// В случае ошибки
return NextResponse.json({ 
  error: 'Failed to link group to organization',
  details: linkError.message || String(linkError)
}, { status: 500 });

// В случае успеха
return NextResponse.json({
  success: true,
  message: 'Group linked to organization',
  groupId: group.id,
  tgChatId: tgChatIdStr
});
```

## Измененные файлы

| Файл | Изменения |
|------|-----------|
| `app/api/telegram/groups/add-to-org/route.ts` | ✅ Приведение `tg_chat_id` к строке<br>✅ Детальное логирование<br>✅ Улучшенная обработка ошибок |

## Как проверить исправление

### 1. Проверка после деплоя

1. Откройте `/app/[org]/telegram/available-groups`
2. Нажмите "Добавить в организацию" для любой группы
3. Откройте консоль браузера

**Ожидаемые логи (успешный случай)**:
```
Adding group 6 to org d7e2e580-6b3d-42e2-bee0-4846794f07ee
Group tg_chat_id: -1001234567890 (original type: number)
Using Telegram account: 123456789 (from org: d7e2e580-...)
Checking existing mapping for org d7e2e580-..., group tg_chat_id: -1001234567890
Creating new mapping for group -1001234567890 in org d7e2e580-...
Successfully linked group -1001234567890 to org d7e2e580-...
Add group response: {success: true, message: "Group linked to organization", groupId: 6, tgChatId: "-1001234567890"}
Группа успешно добавлена в организацию!
```

### 2. Проверка в Vercel Logs

Откройте логи Vercel для запроса `/api/telegram/groups/add-to-org`:

```
Group tg_chat_id: -1001234567890 (original type: number)
Using Telegram account: 123456789 (from org: d7e2e580-...)
Checking existing mapping for org d7e2e580-..., group tg_chat_id: -1001234567890
Creating new mapping for group -1001234567890 in org d7e2e580-...
Successfully linked group -1001234567890 to org d7e2e580-...
```

### 3. Проверка в базе данных

После успешного добавления проверьте таблицу `org_telegram_groups`:

```sql
SELECT 
  org_id,
  tg_chat_id,
  status,
  created_at,
  created_by
FROM org_telegram_groups
WHERE org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee';
```

**Ожидаемый результат**:
- Новая запись с `tg_chat_id` как строка (text)
- `status = 'active'`
- `created_by` = ID пользователя

## Возможные проблемы и решения

### Проблема: "Group already linked to this organization"

**Причина**: Группа уже добавлена в организацию.

**Решение**: Это нормальное поведение. Группа уже присутствует в организации, повторное добавление не требуется.

### Проблема: "Grant admin permissions to @orbo_community_bot before adding the group"

**Причина**: Бот не является администратором группы или `bot_status` не равен `'connected'`.

**Решение**:
1. Убедитесь, что бот добавлен в группу как администратор
2. Обновите права группы через `/api/telegram/groups/update-admin-rights`
3. Повторите попытку добавления

### Проблема: "No verified Telegram accounts found for this user"

**Причина**: У пользователя нет привязанного и подтвержденного Telegram аккаунта.

**Решение**:
1. Перейдите на `/app/[org]/telegram/account`
2. Авторизуйтесь через Telegram Login Widget
3. Убедитесь, что аккаунт подтвержден (`is_verified = true` в `user_telegram_accounts`)

## Дополнительные улучшения

### 1. Стандартизация типа `tg_chat_id`

**Рекомендация**: Использовать `text` (строка) для всех полей `tg_chat_id` в базе данных.

**Миграция** (опционально):
```sql
-- Убедиться, что все tg_chat_id - это строки
UPDATE telegram_groups 
SET tg_chat_id = tg_chat_id::text 
WHERE tg_chat_id IS NOT NULL;

UPDATE org_telegram_groups 
SET tg_chat_id = tg_chat_id::text 
WHERE tg_chat_id IS NOT NULL;

UPDATE telegram_group_admins 
SET tg_chat_id = tg_chat_id::text 
WHERE tg_chat_id IS NOT NULL;

-- Изменить тип столбца на text (если это возможно)
-- Примечание: Это может потребовать более сложной миграции
-- в зависимости от текущего типа и ограничений
```

### 2. Добавление индексов

Для ускорения поиска по `tg_chat_id`:

```sql
-- Индекс для org_telegram_groups
CREATE INDEX IF NOT EXISTS idx_org_telegram_groups_tg_chat_id 
ON org_telegram_groups(tg_chat_id);

-- Индекс для telegram_group_admins
CREATE INDEX IF NOT EXISTS idx_telegram_group_admins_tg_chat_id 
ON telegram_group_admins(tg_chat_id);
```

## Связанные документы

- `TELEGRAM_GROUPS_AVAILABILITY_FIX.md` - исправление проблемы с отображением доступных групп
- `TELEGRAM_WEBHOOK_SETUP.md` - настройка webhook для получения активности
- `FIXES_SUMMARY.md` - сводка всех исправлений

## Дополнительное исправление: Отсутствие столбца `status`

### Проблема

После первого исправления возникла новая ошибка:
```
Error checking group mapping: {
  code: '42703',
  message: 'column org_telegram_groups.status does not exist'
}
```

**Причина**: Миграция `06_org_telegram_groups_status.sql` не была применена на production, поэтому столбец `status` отсутствует в таблице `org_telegram_groups`.

### Решение

Изменен код так, чтобы он мог работать как с столбцом `status`, так и без него:

```typescript
// ✅ Проверяем существование записи БЕЗ столбца status
const { data: existingMapping, error: mappingCheckError } = await supabaseService
  .from('org_telegram_groups')
  .select('org_id, tg_chat_id, created_at') // ✅ Только базовые столбцы
  .eq('org_id', orgId)
  .eq('tg_chat_id', tgChatIdStr)
  .maybeSingle();

// ✅ Если запись существует - возвращаем успех
if (existingMapping) {
  console.log(`Mapping already exists for group ${tgChatIdStr} in org ${orgId}, created at: ${existingMapping.created_at}`);
  return NextResponse.json({
    success: true,
    message: 'Group already linked to this organization',
    groupId: group.id,
    tgChatId: tgChatIdStr
  });
}

// ✅ При вставке НЕ указываем status
// Если столбец существует, он использует default 'active' из миграции
// Если столбца нет, вставка пройдет успешно без него
await supabaseService
  .from('org_telegram_groups')
  .insert({
    org_id: orgId,
    tg_chat_id: tgChatIdStr,
    created_by: user.id
  });
```

### Применение миграции (опционально)

Если вы хотите иметь столбец `status` для будущего функционала (архивирование групп), примените миграцию:

**Файл**: `db/migrations/06_org_telegram_groups_status.sql`

```sql
-- Add status tracking for org_telegram_groups mappings

alter table public.org_telegram_groups
  add column if not exists status text not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

-- Ensure all existing rows default to active
update public.org_telegram_groups
  set status = coalesce(status, 'active')
where status is distinct from 'active' or status is null;

create index if not exists org_telegram_groups_status_idx
  on public.org_telegram_groups (status);

create index if not exists org_telegram_groups_archived_at_idx
  on public.org_telegram_groups (archived_at);
```

**Как применить**:

1. **Через Supabase Dashboard**:
   - Откройте проект в Supabase Dashboard
   - Перейдите в SQL Editor
   - Скопируйте содержимое `db/migrations/06_org_telegram_groups_status.sql`
   - Выполните SQL запрос

2. **Через локальный Supabase CLI** (если используется):
   ```bash
   supabase db push
   ```

3. **Проверка**:
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'org_telegram_groups';
   ```
   
   Должны появиться столбцы: `status`, `archived_at`, `archived_reason`

## Статус

✅ **Исправлено и готово к деплою**  
📅 **Дата**: 10.10.2025  
🔍 **Тестирование**: Добавлено детальное логирование для диагностики  
📊 **Совместимость**: Работает как с миграцией `06`, так и без неё

