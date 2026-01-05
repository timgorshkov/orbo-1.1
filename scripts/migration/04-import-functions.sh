#!/bin/bash
# ==============================================================================
# Скрипт импорта RPC функций в локальную PostgreSQL
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Импорт RPC функций${NC}"
echo -e "${GREEN}========================================${NC}"

# Путь к миграциям
MIGRATIONS_DIR=~/orbo/app/db/migrations
DUMP_DIR=~/orbo/migration_dumps

echo -e "\n${YELLOW}[1/3] Применение миграций с функциями...${NC}"

# Список миграций, содержащих функции
FUNCTION_MIGRATIONS=(
    "021_dashboard_helpers.sql"
    "068_create_get_users_by_ids_function.sql"
    "069_handle_chat_migration.sql"
    "073_fix_member_count_functions.sql"
    "074_implement_participant_scoring.sql"
    "085_analytics_rpc_functions.sql"
    "086_reactions_count_helper.sql"
    "087_fix_analytics_functions.sql"
    "088_fix_analytics_org_id_logic.sql"
    "089_fix_replies_counting.sql"
    "091_key_metrics_function.sql"
    "092_fix_inactive_newcomers_ambiguity.sql"
    "098_weekly_digest_data_rpc.sql"
    "100_fix_weekly_digest_rpc.sql"
    "113_fix_engagement_breakdown_unified_logic.sql"
    "123_create_register_for_event_rpc.sql"
    "136_create_get_user_by_email_function.sql"
    "143_fix_inactive_newcomers_whatsapp.sql"
    "148_optimize_engagement_breakdown.sql"
    "152_openai_logs_fetch_rpc.sql"
    "155_notification_helpers.sql"
    "156_notification_resolution.sql"
    "158_inactive_newcomers_group_check.sql"
    "162_get_user_display_name.sql"
    "164_optimize_participants_query.sql"
    "166_fix_enriched_at_in_rpc.sql"
    "167_fix_links_column_in_rpc.sql"
    "168_get_user_id_by_email.sql"
    "171_webhook_processing_rpc.sql"
)

SUCCESS=0
FAILED=0

for migration in "${FUNCTION_MIGRATIONS[@]}"; do
    if [ -f "$MIGRATIONS_DIR/$migration" ]; then
        echo -n "  Applying $migration... "
        if cat "$MIGRATIONS_DIR/$migration" | docker exec -i orbo_postgres psql -U orbo -d orbo -v ON_ERROR_STOP=0 > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
            ((SUCCESS++))
        else
            echo -e "${YELLOW}⚠${NC}"
            ((FAILED++))
        fi
    else
        echo -e "  ${YELLOW}⚠ $migration не найден${NC}"
    fi
done

echo -e "\n${YELLOW}[2/3] Применение функций из дампа Supabase...${NC}"
if [ -f "$DUMP_DIR/functions.sql" ]; then
    cat $DUMP_DIR/functions.sql | \
        grep -v "supabase_admin" | \
        grep -v "authenticated" | \
        grep -v "anon" | \
        grep -v "service_role" | \
        docker exec -i orbo_postgres psql -U orbo -d orbo -v ON_ERROR_STOP=0 > /dev/null 2>&1
    echo -e "${GREEN}✓ Функции из дампа применены${NC}"
else
    echo -e "${YELLOW}⚠ functions.sql не найден, пропускаем${NC}"
fi

echo -e "\n${YELLOW}[3/3] Проверка созданных функций...${NC}"
FUNC_COUNT=$(docker exec orbo_postgres psql -U orbo -d orbo -t -c "
    SELECT count(*) 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public';
")
echo -e "${GREEN}Всего функций в public schema: ${FUNC_COUNT}${NC}"

echo -e "\n${YELLOW}Список функций:${NC}"
docker exec orbo_postgres psql -U orbo -d orbo -c "
    SELECT p.proname as function_name, 
           pg_get_function_arguments(p.oid) as arguments
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname
    LIMIT 30;
"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Импорт функций завершён!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Успешно: ${GREEN}$SUCCESS${NC}, С предупреждениями: ${YELLOW}$FAILED${NC}"
echo ""
echo -e "${YELLOW}Следующий шаг: ./scripts/migration/05-verify-migration.sh${NC}"

