# Порядок применения миграций 42-49

## ✅ Исправлены проблемы

1. **Дублирование номера 43** - переименовано:
   - ~~`43_migrate_old_materials.sql`~~ → `49_migrate_old_materials.sql`
   
2. **Ошибка `custom_title` в telegram_group_admins**:
   - ~~`43_create_telegram_group_admins.sql`~~ (удалена)
   - ✅ `43_fix_telegram_group_admins.sql` (новая, с проверкой существующей таблицы)

3. **Дублирующиеся slug в материалах**:
   - ✅ Исправлена генерация уникальных slug в `49_migrate_old_materials.sql`

---

## 📋 Правильный порядок применения

### Уже применены (предполагается):
- ✅ `40_fix_sync_telegram_admins_column.sql`
- ✅ `41_fix_sync_telegram_admins_table.sql`
- ✅ `42_cleanup_unused_tables.sql`

### Применяем сейчас:

```sql
-- 1. Создание/обновление таблицы telegram_group_admins
\i db/migrations/43_fix_telegram_group_admins.sql

-- 2. Обновление функции sync_telegram_admins
\i db/migrations/44_sync_telegram_admins_use_new_table.sql

-- 3. Обновление view organization_admins
\i db/migrations/45_update_organization_admins_view.sql

-- 4. Поддержка теневых профилей
\i db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql

-- 5. RLS политики для теневых админов
\i db/migrations/47_rls_policies_for_shadow_admins.sql

-- 6. Таблица приглашений
\i db/migrations/48_create_invitations_table.sql

-- 7. Миграция старых материалов (если есть данные)
\i db/migrations/49_migrate_old_materials.sql
```

---

## 🔍 Проверка перед применением

### Проверка 1: Есть ли старые материалы?

```sql
SELECT 
  (SELECT COUNT(*) FROM material_folders) as folders_count,
  (SELECT COUNT(*) FROM material_items) as items_count;
```

- Если `0` / `0` → **Миграцию 49 можно пропустить**
- Если есть данные → **Применяйте миграцию 49**

### Проверка 2: Существует ли telegram_group_admins?

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'telegram_group_admins'
);
```

- `true` → Миграция 43 добавит недостающие колонки
- `false` → Миграция 43 создаст таблицу

---

## ⚠️ Важные заметки

### Миграция 49 (материалы)

После применения:
1. Проверьте материалы в UI: `/app/[org]/materials`
2. Убедитесь, что всё корректно мигрировало
3. **Только после проверки:** раскомментируйте STEP 7 в миграции для удаления старых таблиц

### Миграция 43 (telegram_group_admins)

- ✅ Безопасна для повторного применения
- ✅ Автоматически добавляет недостающие колонки
- ✅ Не дублирует существующие данные

---

## 🚀 Быстрое применение (если все проверки пройдены)

### Через psql:

```bash
cd "c:\Cursor WS\orbo-1.1"

psql -U postgres -d your_database << EOF
\i db/migrations/43_fix_telegram_group_admins.sql
\i db/migrations/44_sync_telegram_admins_use_new_table.sql
\i db/migrations/45_update_organization_admins_view.sql
\i db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql
\i db/migrations/47_rls_policies_for_shadow_admins.sql
\i db/migrations/48_create_invitations_table.sql
\i db/migrations/49_migrate_old_materials.sql
EOF
```

### Через Supabase SQL Editor:

1. Откройте SQL Editor
2. Применяйте по одной миграции
3. Проверяйте результат после каждой

---

## ✅ После применения всех миграций

Проверьте:

```sql
-- 1. Таблица telegram_group_admins создана
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'telegram_group_admins';

-- Должны быть: custom_title, can_post_messages, can_edit_messages

-- 2. View organization_admins работает
SELECT * FROM organization_admins LIMIT 1;

-- 3. Функция sync_telegram_admins работает
SELECT * FROM sync_telegram_admins('your-org-id');

-- 4. Материалы мигрировали (если были)
SELECT COUNT(*) FROM material_pages;
```

---

## 🆘 Troubleshooting

### Ошибка: "cannot change return type of existing function"

**Миграция 46:** Уже исправлено - функция теперь удаляется перед пересозданием  
**Решение:** Примените обновлённую миграцию 46

### Ошибка: "syntax error at or near DELETE"

**Миграция 46:** Уже исправлено - переписана логика удаления админов с использованием CTE  
**Решение:** Примените последнюю версию миграции 46

### Ошибка: "column reference user_id is ambiguous"

**Миграция 46:** Уже исправлено - добавлены префиксы таблиц в WHERE условиях  
**Решение:** Примените последнюю версию миграции 46

### Ошибка: "functions in index predicate must be marked IMMUTABLE"

**Миграция 48:** Уже исправлено - убрана функция `NOW()` из предиката индекса  
**Решение:** Примените последнюю версию миграции 48  
**Детали:** Индекс теперь включает `expires_at` как колонку, а фильтрацию по времени делайте в запросах

### Ошибка: "duplicate key value violates unique constraint"

**В материалах (49):** Уже исправлено - slug теперь генерируются уникально  
**В других таблицах:** Проверьте, не применяли ли миграцию дважды

### Ошибка: "column does not exist"

**custom_title:** Миграция 43 теперь добавляет её автоматически  
**Другие колонки:** Убедитесь, что применяете миграции по порядку

### Ошибка: "relation does not exist"

Проверьте, что предыдущие миграции (40-42) применены успешно

---

**Дата обновления:** 2025-10-19  
**Статус:** ✅ Готово к применению

