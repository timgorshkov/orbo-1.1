#!/bin/bash
# ==============================================================================
# Скрипт верификации миграции
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Верификация миграции${NC}"
echo -e "${GREEN}========================================${NC}"

# Загружаем переменные для сравнения с Supabase
source ~/orbo/.env
SUPABASE_PROJECT_REF=$(echo $NEXT_PUBLIC_SUPABASE_URL | sed 's|https://||' | sed 's|.supabase.co||')
SUPABASE_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"

ERRORS=0

echo -e "\n${YELLOW}[1/5] Сравнение количества таблиц...${NC}"

LOCAL_TABLES=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
if [ -n "$SUPABASE_DB_PASSWORD" ]; then
    SUPABASE_TABLES=$(PGPASSWORD=$SUPABASE_DB_PASSWORD psql -h $SUPABASE_HOST -p 5432 -U postgres -d postgres -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "N/A")
else
    SUPABASE_TABLES="N/A (нет пароля)"
fi

echo "  Локальная БД: $LOCAL_TABLES таблиц"
echo "  Supabase: $SUPABASE_TABLES таблиц"

if [ "$LOCAL_TABLES" != "$SUPABASE_TABLES" ] && [ "$SUPABASE_TABLES" != "N/A" ]; then
    echo -e "  ${YELLOW}⚠ Количество таблиц отличается${NC}"
    ((ERRORS++))
else
    echo -e "  ${GREEN}✓ OK${NC}"
fi

echo -e "\n${YELLOW}[2/5] Проверка критических таблиц...${NC}"
CRITICAL_TABLES=(
    "organizations"
    "memberships"
    "participants"
    "telegram_groups"
    "activity_events"
    "events"
    "event_registrations"
    "notification_rules"
    "notification_logs"
)

for table in "${CRITICAL_TABLES[@]}"; do
    COUNT=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "SELECT count(*) FROM $table;" 2>/dev/null || echo "ERROR")
    if [ "$COUNT" == "ERROR" ]; then
        echo -e "  ${RED}✗ $table - таблица не найдена${NC}"
        ((ERRORS++))
    else
        echo -e "  ${GREEN}✓ $table - $COUNT записей${NC}"
    fi
done

echo -e "\n${YELLOW}[3/5] Проверка критических RPC функций...${NC}"
CRITICAL_FUNCTIONS=(
    "get_churning_participants"
    "get_inactive_newcomers"
    "sync_telegram_admins"
    "get_engagement_breakdown"
    "register_for_event"
    "get_user_id_by_email"
    "log_error"
)

for func in "${CRITICAL_FUNCTIONS[@]}"; do
    EXISTS=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "
        SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = '$func');
    ")
    if [[ "$EXISTS" == *"t"* ]]; then
        echo -e "  ${GREEN}✓ $func${NC}"
    else
        echo -e "  ${RED}✗ $func - функция не найдена${NC}"
        ((ERRORS++))
    fi
done

echo -e "\n${YELLOW}[4/5] Проверка индексов...${NC}"
INDEX_COUNT=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "
    SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';
")
echo -e "  Всего индексов: $INDEX_COUNT"

# Проверяем важные индексы
IMPORTANT_INDEXES=(
    "participants_org_id"
    "activity_events_tg_chat_id"
    "events_org_id"
)

for idx in "${IMPORTANT_INDEXES[@]}"; do
    EXISTS=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "
        SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname LIKE '%$idx%');
    ")
    if [[ "$EXISTS" == *"t"* ]]; then
        echo -e "  ${GREEN}✓ Индекс $idx существует${NC}"
    else
        echo -e "  ${YELLOW}⚠ Индекс $idx не найден${NC}"
    fi
done

echo -e "\n${YELLOW}[5/5] Проверка constraints...${NC}"
CONSTRAINT_COUNT=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "
    SELECT count(*) 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public';
")
echo -e "  Всего constraints: $CONSTRAINT_COUNT"

echo -e "\n${GREEN}========================================${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}  ✓ Верификация пройдена успешно!${NC}"
else
    echo -e "${YELLOW}  ⚠ Верификация завершена с $ERRORS предупреждениями${NC}"
fi
echo -e "${GREEN}========================================${NC}"

echo ""
echo "Детальный отчёт сохранён в: ~/orbo/migration_dumps/verification_report.txt"

# Сохраняем отчёт
docker exec orbo_postgres psql -U orbo -d orbo -c "
    SELECT 
        schemaname,
        relname as table_name,
        n_live_tup as row_count
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname;
" > ~/orbo/migration_dumps/verification_report.txt

echo ""
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}Миграция данных завершена успешно!${NC}"
    echo ""
    echo "Следующие шаги:"
    echo "1. Проверить работу приложения с локальной БД (опционально)"
    echo "2. Начать Фазу 1: Database Abstraction Layer"
else
    echo -e "${YELLOW}Рекомендуется проверить предупреждения перед продолжением.${NC}"
fi

