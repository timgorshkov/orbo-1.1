#!/bin/bash
# ==============================================================================
# Скрипт экспорта данных из Supabase
# ==============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Экспорт данных из Supabase${NC}"
echo -e "${GREEN}========================================${NC}"

# Загружаем переменные окружения
source ~/orbo/.env

# Извлекаем project ref из URL
SUPABASE_PROJECT_REF=$(echo $NEXT_PUBLIC_SUPABASE_URL | sed 's|https://||' | sed 's|.supabase.co||')
# Используем Supabase Pooler (IPv4) вместо прямого подключения (IPv6)
SUPABASE_HOST="aws-0-eu-central-1.pooler.supabase.com"
SUPABASE_USER="postgres.${SUPABASE_PROJECT_REF}"
SUPABASE_PORT=5432  # Session mode для pg_dump

echo -e "${YELLOW}Supabase Project: ${SUPABASE_PROJECT_REF}${NC}"
echo -e "${YELLOW}Database Host: ${SUPABASE_HOST} (Pooler IPv4)${NC}"
echo -e "${YELLOW}Database User: ${SUPABASE_USER}${NC}"

# Проверяем наличие пароля
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo -e "${RED}ERROR: SUPABASE_DB_PASSWORD не найден в .env${NC}"
    echo ""
    echo "Добавьте в ~/orbo/.env:"
    echo "SUPABASE_DB_PASSWORD=your_database_password"
    echo ""
    echo "Пароль можно найти в Supabase Dashboard → Settings → Database → Database Password"
    exit 1
fi

# Создаём директорию для дампов
DUMP_DIR=~/orbo/migration_dumps
mkdir -p $DUMP_DIR
cd $DUMP_DIR

echo -e "\n${YELLOW}[1/4] Экспорт схемы (без данных)...${NC}"
PGPASSWORD=$SUPABASE_DB_PASSWORD pg_dump \
    -h $SUPABASE_HOST \
    -p $SUPABASE_PORT \
    -U $SUPABASE_USER \
    -d postgres \
    --schema=public \
    --schema-only \
    --no-owner \
    --no-acl \
    --no-comments \
    > schema.sql

if [ $? -eq 0 ] && [ -s schema.sql ]; then
    echo -e "${GREEN}✓ Схема экспортирована: schema.sql ($(du -h schema.sql | cut -f1))${NC}"
else
    echo -e "${RED}✗ Ошибка экспорта схемы${NC}"
    exit 1
fi

echo -e "\n${YELLOW}[2/4] Экспорт данных (без схемы)...${NC}"
PGPASSWORD=$SUPABASE_DB_PASSWORD pg_dump \
    -h $SUPABASE_HOST \
    -p $SUPABASE_PORT \
    -U $SUPABASE_USER \
    -d postgres \
    --schema=public \
    --data-only \
    --no-owner \
    --no-acl \
    --disable-triggers \
    > data.sql

if [ $? -eq 0 ] && [ -s data.sql ]; then
    echo -e "${GREEN}✓ Данные экспортированы: data.sql ($(du -h data.sql | cut -f1))${NC}"
else
    echo -e "${RED}✗ Ошибка экспорта данных${NC}"
    exit 1
fi

echo -e "\n${YELLOW}[3/4] Экспорт функций и триггеров...${NC}"
PGPASSWORD=$SUPABASE_DB_PASSWORD pg_dump \
    -h $SUPABASE_HOST \
    -p $SUPABASE_PORT \
    -U $SUPABASE_USER \
    -d postgres \
    --schema=public \
    --schema-only \
    --no-owner \
    --no-acl \
    > functions.sql

# Извлекаем только функции из дампа
grep -A 1000 "CREATE FUNCTION" functions.sql > functions_only.sql 2>/dev/null || true

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Функции экспортированы: functions.sql${NC}"
else
    echo -e "${YELLOW}⚠ Функции частично экспортированы${NC}"
fi

echo -e "\n${YELLOW}[4/4] Экспорт auth.users (для будущей миграции Auth)...${NC}"
PGPASSWORD=$SUPABASE_DB_PASSWORD psql \
    -h $SUPABASE_HOST \
    -p $SUPABASE_PORT \
    -U $SUPABASE_USER \
    -d postgres \
    -c "COPY (SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data FROM auth.users) TO STDOUT WITH CSV HEADER" \
    > auth_users.csv

if [ $? -eq 0 ]; then
    USER_COUNT=$(wc -l < auth_users.csv)
    echo -e "${GREEN}✓ Пользователи экспортированы: auth_users.csv ($((USER_COUNT-1)) пользователей)${NC}"
else
    echo -e "${YELLOW}⚠ Не удалось экспортировать auth.users (возможно, нет прав)${NC}"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Экспорт завершён!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Файлы сохранены в: $DUMP_DIR"
ls -lh $DUMP_DIR/*.sql $DUMP_DIR/*.csv 2>/dev/null
echo ""
echo -e "${YELLOW}Следующий шаг: ./scripts/migration/02-import-schema.sh${NC}"

