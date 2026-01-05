#!/bin/bash
# ==============================================================================
# Скрипт импорта схемы в локальную PostgreSQL
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Импорт схемы в локальную PostgreSQL${NC}"
echo -e "${GREEN}========================================${NC}"

DUMP_DIR=~/orbo/migration_dumps

# Проверяем наличие дампа
if [ ! -f "$DUMP_DIR/schema.sql" ]; then
    echo -e "${RED}ERROR: schema.sql не найден!${NC}"
    echo "Сначала выполните: ./scripts/migration/01-export-supabase.sh"
    exit 1
fi

echo -e "\n${YELLOW}[1/3] Очистка существующей схемы...${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO orbo;
    GRANT ALL ON SCHEMA public TO public;
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Схема очищена${NC}"
else
    echo -e "${RED}✗ Ошибка очистки схемы${NC}"
    exit 1
fi

echo -e "\n${YELLOW}[2/3] Создание расширений...${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "
    CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
    CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";
    CREATE EXTENSION IF NOT EXISTS \"btree_gin\";
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Расширения созданы${NC}"
else
    echo -e "${YELLOW}⚠ Некоторые расширения недоступны${NC}"
fi

echo -e "\n${YELLOW}[3/3] Импорт схемы...${NC}"
# Фильтруем проблемные строки и импортируем
cat $DUMP_DIR/schema.sql | \
    grep -v "^--" | \
    grep -v "^SET " | \
    grep -v "^SELECT pg_catalog" | \
    grep -v "OWNER TO" | \
    grep -v "supabase_admin" | \
    grep -v "authenticated" | \
    grep -v "anon" | \
    grep -v "service_role" | \
    docker exec -i orbo_postgres psql -U orbo -d orbo -v ON_ERROR_STOP=0

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Схема импортирована${NC}"
else
    echo -e "${YELLOW}⚠ Схема импортирована с предупреждениями${NC}"
fi

echo -e "\n${YELLOW}Проверка импортированных таблиц...${NC}"
TABLE_COUNT=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
echo -e "${GREEN}Импортировано таблиц: ${TABLE_COUNT}${NC}"

docker exec orbo_postgres psql -U orbo -d orbo -c "\dt" | head -30

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Импорт схемы завершён!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Следующий шаг: ./scripts/migration/03-import-data.sh${NC}"

