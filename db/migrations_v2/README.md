# Консолидированные миграции v2

## Назначение

Эта папка содержит консолидированную версию миграций для чистого развёртывания на новом хостинге.

## Структура файлов

```
001_schema.sql        # Все таблицы, колонки, индексы, constraints
002_functions.sql     # Все функции и триггеры
003_rls_policies.sql  # Все RLS политики
004_views.sql         # Все views
005_seed_data.sql     # Начальные данные (superadmins, buckets)
```

## Как сгенерировать консолидированные миграции

### Вариант 1: Экспорт из текущей Supabase (рекомендуется)

1. Зайти в Supabase Dashboard → Project Settings → Database
2. Использовать pg_dump:

```bash
# Экспорт схемы (без данных)
pg_dump -h db.YOUR_PROJECT.supabase.co -U postgres -d postgres \
  --schema-only --no-owner --no-privileges \
  -f db/migrations_v2/001_full_schema.sql

# Экспорт функций
pg_dump -h db.YOUR_PROJECT.supabase.co -U postgres -d postgres \
  --schema-only --no-owner -t 'public.*' \
  --section=pre-data --section=post-data \
  -f db/migrations_v2/002_functions.sql
```

### Вариант 2: Использовать Supabase CLI

```bash
# Установить Supabase CLI
npm install -g supabase

# Связать с проектом
supabase link --project-ref YOUR_PROJECT_REF

# Экспорт схемы
supabase db dump -f db/migrations_v2/001_full_schema.sql
```

## После генерации

1. Разделить большой файл на логические части (schema, functions, rls, views)
2. Добавить seed данные (superadmins, storage buckets)
3. Протестировать на чистой базе
4. Удалить папку migrations_archive/ после успешного теста

## Применение на новом хостинге

```bash
psql -h NEW_HOST -U postgres -d NEW_DB -f db/migrations_v2/001_schema.sql
psql -h NEW_HOST -U postgres -d NEW_DB -f db/migrations_v2/002_functions.sql
psql -h NEW_HOST -U postgres -d NEW_DB -f db/migrations_v2/003_rls_policies.sql
psql -h NEW_HOST -U postgres -d NEW_DB -f db/migrations_v2/004_views.sql
psql -h NEW_HOST -U postgres -d NEW_DB -f db/migrations_v2/005_seed_data.sql
```

