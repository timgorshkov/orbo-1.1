# План миграции материалов (старая → новая система)

## 🎯 Ситуация

**Обнаружено данных в старой системе:**
- `material_folders`: 1 запись
- `material_items`: 6 записей
- `material_access`: 0 записей

**Нужно:** Перенести данные в `material_pages` (новая система)

---

## 📋 ПЛАН ДЕЙСТВИЙ

### Шаг 1: Посмотри, что именно там хранится

Выполни в Supabase SQL Editor:

```sql
-- Посмотреть папку
SELECT id, org_id, parent_id, name, created_at 
FROM material_folders;

-- Посмотреть айтемы
SELECT id, org_id, folder_id, kind, title, 
       substring(content from 1 for 50) as content_preview,
       file_path, url, created_at
FROM material_items
ORDER BY created_at;
```

**Запиши результат** (или сделай скриншот) - это поможет проверить правильность миграции.

---

### Шаг 2: Применить миграцию 43

```sql
-- Запусти этот файл в Supabase SQL Editor:
-- db/migrations/43_migrate_old_materials.sql
```

**Что произойдет:**
1. Папка превратится в страницу-раздел в `material_pages`
2. Каждый айтем превратится в отдельную страницу
3. Сохранятся связи parent-child
4. Контент будет преобразован:
   - `kind='doc'` → содержимое как есть
   - `kind='link'` → страница со ссылкой
   - `kind='file'` → страница с указанием на файл

---

### Шаг 3: Проверить результат в UI

1. Открой `/app/[org]/materials`
2. Проверь:
   - ✓ Все материалы на месте?
   - ✓ Контент отображается правильно?
   - ✓ Структура папок сохранена?

---

### Шаг 4: Проверить в БД

```sql
-- Проверить количество мигрированных страниц
SELECT COUNT(*) as total_pages FROM material_pages;

-- Посмотреть мигрированные страницы
SELECT id, title, slug, parent_id, 
       substring(content_md from 1 for 50) as content_preview,
       created_at
FROM material_pages
WHERE org_id = 'YOUR_ORG_ID' -- Замени на свой org_id
ORDER BY created_at;
```

**Ожидаемый результат:**
- Должно быть 7 страниц (1 папка + 6 айтемов)

---

### Шаг 5: Удалить старые таблицы (если всё ОК)

Если проверка прошла успешно, раскомментируй STEP 7 в миграции 43:

```sql
-- В файле db/migrations/43_migrate_old_materials.sql
-- Раскомментируй строки 178-188:

DO $$
BEGIN
  RAISE NOTICE 'Step 5: Dropping old tables...';
  
  DROP TABLE IF EXISTS material_access CASCADE;
  DROP TABLE IF EXISTS material_items CASCADE;
  DROP TABLE IF EXISTS material_folders CASCADE;
  
  RAISE NOTICE '  ✅ Old material tables dropped';
  RAISE NOTICE '';
END $$;
```

И запусти миграцию 43 повторно (она безопасна для повторного запуска).

---

## 🔄 Как работает миграция

### Преобразование folder → page:
```
material_folders:
  id: abc-123
  name: "Документация"
  parent_id: NULL

        ↓

material_pages:
  id: xyz-789 (новый)
  title: "Документация"
  slug: "dokumentaciya"
  content_md: "# Документация\n\nЭто раздел материалов..."
  parent_id: NULL
```

### Преобразование item → page:
```
material_items:
  id: def-456
  kind: "doc"
  title: "Начало работы"
  content: "Инструкция..."
  folder_id: abc-123

        ↓

material_pages:
  id: uvw-101 (новый)
  title: "Начало работы"
  slug: "nachalo-raboty"
  content_md: "# Начало работы\n\nИнструкция..."
  parent_id: xyz-789 (ссылка на мигрированную папку)
```

---

## ⚠️ Важные моменты

1. **Файлы (kind='file'):**
   - Путь к файлу сохранится в content_md
   - Но доступность файла нужно проверить вручную
   - Возможно, потребуется перезалить в новую систему

2. **Ссылки (kind='link'):**
   - Преобразуются в страницы со ссылкой
   - Можно будет отредактировать через UI

3. **Slugs:**
   - Автоматически генерируются из заголовков
   - Если есть дубликаты - добавляется часть ID

4. **Безопасность:**
   - Миграция НЕ удаляет старые таблицы автоматически
   - Удаление только после твоего подтверждения (STEP 7)

---

## 🆘 Если что-то пошло не так

### Откат миграции 43:

```sql
-- Удалить мигрированные страницы
DELETE FROM material_pages 
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND (
    content_md LIKE '%мигрирован из старой системы%'
    OR updated_at >= NOW() - INTERVAL '1 hour'
  );

-- Старые таблицы останутся нетронутыми
-- Данные не потеряются
```

**Или:** Просто не запускай STEP 7 - старые таблицы останутся, и можно будет попробовать снова.

---

## ✅ Чеклист

- [ ] Шаг 1: Посмотрел, что в старых таблицах
- [ ] Шаг 2: Применил миграцию 43
- [ ] Шаг 3: Проверил в UI (/app/[org]/materials)
- [ ] Шаг 4: Проверил в БД (count и content)
- [ ] Шаг 5: Удалил старые таблицы (раскомментировал STEP 7)

---

**Готов начать?** Выполни Шаг 1 и покажи, что там в старых таблицах! 🚀



