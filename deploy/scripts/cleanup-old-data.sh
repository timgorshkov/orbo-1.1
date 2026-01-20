#!/bin/bash
# Cleanup old data from fast-growing tables
# Runs daily via cron at 3:00 AM
# Add to crontab: 0 3 * * * /home/deploy/orbo/scripts/cleanup-old-data.sh >> /var/log/orbo-cleanup.log 2>&1

LOG_PREFIX="[DB-CLEANUP]"
POSTGRES_CONTAINER="orbo_postgres"

echo "$LOG_PREFIX Starting cleanup at $(date)"

# Delete telegram_health_events older than 90 days
docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "
DELETE FROM telegram_health_events 
WHERE created_at < NOW() - INTERVAL '90 days';
" && echo "$LOG_PREFIX telegram_health_events cleaned"

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

# Vacuum analyze for performance (optional, runs weekly check)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    echo "$LOG_PREFIX Running weekly VACUUM ANALYZE..."
    docker exec $POSTGRES_CONTAINER psql -U orbo -d orbo -c "VACUUM ANALYZE;"
    echo "$LOG_PREFIX VACUUM ANALYZE completed"
fi

echo "$LOG_PREFIX Cleanup completed at $(date)"
