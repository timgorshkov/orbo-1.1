# 🔄 Миграция с Supabase на локальную PostgreSQL

## Предварительные требования

1. Доступ к Supabase Dashboard для получения Database Password
2. SSH доступ к серверу Selectel
3. Установленный `pg_dump` и `psql` на сервере

## Шаг 1: Получение Database Password

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите проект → Settings → Database
3. Скопируйте **Database Password** (не Connection String)

## Шаг 2: Экспорт данных

```bash
# На сервере Selectel
cd ~/orbo
./scripts/migration/01-export-supabase.sh
```

## Шаг 3: Импорт схемы

```bash
./scripts/migration/02-import-schema.sh
```

## Шаг 4: Импорт данных

```bash
./scripts/migration/03-import-data.sh
```

## Шаг 5: Перенос RPC функций

```bash
./scripts/migration/04-import-functions.sh
```

## Шаг 6: Верификация

```bash
./scripts/migration/05-verify-migration.sh
```

---

## Файлы миграции

| Файл | Описание |
|------|----------|
| `01-export-supabase.sh` | Экспорт схемы и данных из Supabase |
| `02-import-schema.sh` | Импорт структуры таблиц |
| `03-import-data.sh` | Импорт данных |
| `04-import-functions.sh` | Импорт RPC функций |
| `05-verify-migration.sh` | Проверка целостности |
| `06-export-auth-users.sh` | Экспорт пользователей auth.users |

---

## Откат

В случае проблем, локальная БД может быть очищена:

```bash
docker exec orbo_postgres psql -U orbo -d orbo -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

Supabase остаётся нетронутым до финального переключения.

