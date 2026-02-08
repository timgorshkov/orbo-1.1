#!/bin/bash
# Cleanup old data from fast-growing tables + server maintenance
# Runs daily via cron at 3:00 AM
# Add to crontab: 0 3 * * * /home/deploy/orbo/scripts/cleanup-old-data.sh >> /var/log/orbo-cleanup.log 2>&1

LOG_PREFIX="[DB-CLEANUP]"
POSTGRES_CONTAINER="orbo_postgres"

echo "$LOG_PREFIX Starting cleanup at $(date)"

# ============================================
# Database table cleanup
# ============================================

# Delete telegram_health_events older than 30 days
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM telegram_health_events 
WHERE created_at < NOW() - INTERVAL '30 days';
" && echo "$LOG_PREFIX telegram_health_events cleaned (30d retention)"

# Delete telegram_webhook_idempotency older than 7 days
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM telegram_webhook_idempotency 
WHERE created_at < NOW() - INTERVAL '7 days';
" && echo "$LOG_PREFIX telegram_webhook_idempotency cleaned"

# Delete old email_auth_tokens (expired)
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM email_auth_tokens 
WHERE expires_at < NOW() - INTERVAL '7 days';
" && echo "$LOG_PREFIX email_auth_tokens cleaned"

# Delete old telegram_auth_codes (expired)
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM telegram_auth_codes 
WHERE expires_at < NOW() - INTERVAL '7 days';
" && echo "$LOG_PREFIX telegram_auth_codes cleaned"

# Delete old openai_api_logs older than 90 days
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM openai_api_logs 
WHERE created_at < NOW() - INTERVAL '90 days';
" && echo "$LOG_PREFIX openai_api_logs cleaned (90d retention)"

# Delete old notification_logs older than 90 days (resolved only)
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM notification_logs 
WHERE created_at < NOW() - INTERVAL '90 days'
AND resolved_at IS NOT NULL;
" && echo "$LOG_PREFIX old resolved notification_logs cleaned (90d)"

# ============================================
# PostgreSQL log cleanup (inside container)
# ============================================
docker exec $POSTGRES_CONTAINER sh -c "
find /var/lib/postgresql/data/log -name 'postgresql-*.log' -mtime +14 -delete 2>/dev/null
" && echo "$LOG_PREFIX PG logs older than 14 days cleaned"

# ============================================
# Vacuum analyze for performance (weekly)
# ============================================
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    echo "$LOG_PREFIX Running weekly VACUUM ANALYZE..."
    docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "VACUUM ANALYZE;"
    echo "$LOG_PREFIX VACUUM ANALYZE completed"
fi

echo "$LOG_PREFIX Cleanup completed at $(date)"
