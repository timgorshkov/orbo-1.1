#!/bin/bash
# ==============================================================================
# Скрипт импорта данных в локальную PostgreSQL
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Импорт данных в локальную PostgreSQL${NC}"
echo -e "${GREEN}========================================${NC}"

DUMP_DIR=~/orbo/migration_dumps

# Проверяем наличие дампа
if [ ! -f "$DUMP_DIR/data.sql" ]; then
    echo -e "${RED}ERROR: data.sql не найден!${NC}"
    echo "Сначала выполните: ./scripts/migration/01-export-supabase.sh"
    exit 1
fi

echo -e "\n${YELLOW}[1/2] Отключение триггеров и constraints...${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "
    SET session_replication_role = 'replica';
"

echo -e "\n${YELLOW}[2/2] Импорт данных...${NC}"
echo "Это может занять несколько минут в зависимости от объёма данных..."

# Импортируем данные, игнорируя ошибки constraint на этом этапе
cat $DUMP_DIR/data.sql | \
    grep -v "^--" | \
    grep -v "^SET " | \
    grep -v "^SELECT pg_catalog" | \
    docker exec -i orbo_postgres psql -U orbo -d orbo -v ON_ERROR_STOP=0

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Данные импортированы${NC}"
else
    echo -e "${YELLOW}⚠ Данные импортированы с предупреждениями${NC}"
fi

echo -e "\n${YELLOW}Включение триггеров обратно...${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "
    SET session_replication_role = 'origin';
"

echo -e "\n${YELLOW}Статистика импорта:${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "
    SELECT 
        schemaname,
        relname as table_name,
        n_live_tup as row_count
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_live_tup DESC
    LIMIT 20;
"

# Пересчитываем статистику
echo -e "\n${YELLOW}Обновление статистики таблиц...${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "ANALYZE;"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Импорт данных завершён!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Следующий шаг: ./scripts/migration/04-import-functions.sh${NC}"

