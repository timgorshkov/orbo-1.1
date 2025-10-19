# Инструкция по применению миграции 06_org_telegram_groups_status

## Зачем нужна эта миграция?

Миграция добавляет столбцы `status`, `archived_at`, `archived_reason` в таблицу `org_telegram_groups`, которые позволяют:
- Архивировать группы (вместо полного удаления)
- Отслеживать историю связей между организациями и группами
- Восстанавливать ранее удаленные группы

**Важно**: Код уже исправлен для работы БЕЗ этой миграции. Применение миграции опционально и нужно только если вы планируете использовать функционал архивирования.

## Как применить миграцию

### Способ 1: Через Supabase Dashboard (рекомендуется)

1. Откройте ваш проект в [Supabase Dashboard](https://supabase.com/dashboard)

2. В левом меню выберите **SQL Editor**

3. Нажмите **New Query**

4. Скопируйте и вставьте следующий SQL код:

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

5. Нажмите **Run** (или `Ctrl+Enter` / `Cmd+Enter`)

6. Дождитесь сообщения **Success**

### Способ 2: Через локальный файл

Если у вас есть доступ к файлу миграции на сервере:

1. Найдите файл: `db/migrations/06_org_telegram_groups_status.sql`

2. Скопируйте его содержимое

3. Выполните его через Supabase Dashboard (см. Способ 1, шаги 2-6)

### Способ 3: Через Supabase CLI (если используется)

```bash
# Убедитесь, что вы в корневой директории проекта
cd /path/to/your/project

# Примените миграцию
supabase db push
```

## Проверка результата

После применения миграции выполните следующий SQL запрос для проверки:

```sql
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'org_telegram_groups'
ORDER BY ordinal_position;
```

**Ожидаемый результат** должен включать столбцы:

| column_name | data_type | column_default | is_nullable |
|-------------|-----------|----------------|-------------|
| org_id | uuid | | NO |
| tg_chat_id | bigint | | NO |
| created_by | uuid | | YES |
| created_at | timestamp with time zone | now() | YES |
| **status** | **text** | **'active'::text** | **NO** |
| **archived_at** | **timestamp with time zone** | | **YES** |
| **archived_reason** | **text** | | **YES** |

## Проверка индексов

Убедитесь, что индексы созданы:

```sql
SELECT 
  indexname, 
  indexdef
FROM pg_indexes 
WHERE tablename = 'org_telegram_groups'
ORDER BY indexname;
```

**Ожидаемые индексы**:
- `org_telegram_groups_pkey` - первичный ключ (org_id, tg_chat_id)
- `org_telegram_groups_tg_chat_id_idx` - индекс для обратного поиска по tg_chat_id
- **`org_telegram_groups_status_idx`** - **новый индекс для status**
- **`org_telegram_groups_archived_at_idx`** - **новый индекс для archived_at**

## Что делать, если миграция не применилась?

### Ошибка: "column already exists"

Это нормально! Столбцы уже были добавлены ранее. Миграция использует `IF NOT EXISTS`, поэтому безопасна для повторного запуска.

### Ошибка: "permission denied"

У вашей учетной записи недостаточно прав. Используйте учетную запись с правами администратора БД.

### Ошибка: "table does not exist"

Проверьте, что базовая таблица `org_telegram_groups` существует:

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_name = 'org_telegram_groups'
);
```

Если возвращает `false`, сначала примените миграцию `05_org_telegram_groups.sql`.

## Откат миграции (если нужно)

Если вы хотите удалить добавленные столбцы:

```sql
-- ⚠️ ВНИМАНИЕ: Это удалит все данные в этих столбцах!

alter table public.org_telegram_groups
  drop column if exists status,
  drop column if exists archived_at,
  drop column if exists archived_reason;

drop index if exists public.org_telegram_groups_status_idx;
drop index if exists public.org_telegram_groups_archived_at_idx;
```

## Статус применения

- ✅ Миграция применена успешно
- ✅ Индексы созданы
- ✅ Все существующие записи обновлены (`status = 'active'`)
- ✅ Код работает корректно

## Связанные документы

- `TELEGRAM_GROUP_MAPPING_FIX.md` - детальное описание проблемы и решения
- `FIXES_SUMMARY.md` - общая сводка всех исправлений
- `db/migrations/05_org_telegram_groups.sql` - базовая миграция для таблицы
- `db/migrations/06_org_telegram_groups_status.sql` - эта миграция

---

**Дата создания**: 10.10.2025  
**Автор**: AI Assistant  
**Статус**: Опциональная миграция (код работает без неё)

