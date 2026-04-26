#!/bin/bash
# ============================================
# Orbo Health Monitor
# ============================================
#
# Checks application health, disk space, and memory.
# Sends Telegram alerts on failures.
#
# Add to crontab (every 5 minutes):
#   */5 * * * * /home/deploy/orbo/scripts/health-monitor.sh >> /var/log/orbo-health.log 2>&1
#

# Load environment
source /home/deploy/orbo/.env 2>/dev/null || true

APP_URL="${NEXT_PUBLIC_APP_URL:-https://my.orbo.ru}"
ALERT_BOT_TOKEN="${TELEGRAM_NOTIFICATIONS_BOT_TOKEN}"
ALERT_CHAT_ID="${HEALTH_ALERT_CHAT_ID}"
DISK_THRESHOLD=85
MEMORY_THRESHOLD=85
LOG_FILE="/var/log/orbo-health.log"
STATE_DIR="/tmp/orbo-health"

mkdir -p "$STATE_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

send_telegram_alert() {
    local message="$1"
    if [ -n "$ALERT_BOT_TOKEN" ] && [ -n "$ALERT_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${ALERT_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${ALERT_CHAT_ID}" \
            -d "text=${message}" \
            -d "parse_mode=HTML" > /dev/null 2>&1 || true
    fi
}

should_alert() {
    local check_name="$1"
    local cooldown_minutes="${2:-30}"
    local state_file="$STATE_DIR/$check_name"

    if [ ! -f "$state_file" ]; then
        touch "$state_file"
        return 0
    fi

    local last_alert=$(stat -c %Y "$state_file" 2>/dev/null || stat -f %m "$state_file" 2>/dev/null)
    local now=$(date +%s)
    local diff=$(( (now - last_alert) / 60 ))

    if [ "$diff" -ge "$cooldown_minutes" ]; then
        touch "$state_file"
        return 0
    fi
    return 1
}

clear_alert() {
    local check_name="$1"
    rm -f "$STATE_DIR/$check_name" 2>/dev/null
}

ISSUES=0

# ============================================
# 1. Application Health Check
# ============================================
HTTP_CODE=$(curl -s -o /tmp/health_response.json -w "%{http_code}" --max-time 10 "$APP_URL/api/health" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    STATUS=$(cat /tmp/health_response.json 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$STATUS" = "healthy" ]; then
        log "OK: App healthy (HTTP $HTTP_CODE)"
        clear_alert "app_down"
    else
        log "WARN: App degraded - $STATUS (HTTP $HTTP_CODE)"
        ISSUES=$((ISSUES + 1))
        if should_alert "app_degraded" 30; then
            send_telegram_alert "⚠️ <b>Orbo: Degraded</b>
Status: $STATUS
HTTP: $HTTP_CODE"
        fi
    fi
else
    log "CRITICAL: App unreachable (HTTP $HTTP_CODE)"
    ISSUES=$((ISSUES + 1))
    if should_alert "app_down" 10; then
        send_telegram_alert "🔴 <b>Orbo: DOWN</b>
HTTP: $HTTP_CODE
URL: $APP_URL/api/health"
    fi
fi

# ============================================
# 2. Disk Space Check
# ============================================
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')

if [ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]; then
    log "WARN: Disk usage ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)"
    ISSUES=$((ISSUES + 1))
    if should_alert "disk_full" 60; then
        DISK_FREE=$(df -h / | tail -1 | awk '{print $4}')
        send_telegram_alert "💾 <b>Orbo: Disk Alert</b>
Usage: ${DISK_USAGE}%
Free: ${DISK_FREE}"
    fi
else
    log "OK: Disk usage ${DISK_USAGE}%"
    clear_alert "disk_full"
fi

# ============================================
# 3. Memory Check
# ============================================
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')

if [ "$MEM_USAGE" -ge "$MEMORY_THRESHOLD" ]; then
    log "WARN: Memory usage ${MEM_USAGE}% (threshold: ${MEMORY_THRESHOLD}%)"
    ISSUES=$((ISSUES + 1))
    if should_alert "mem_high" 60; then
        MEM_FREE=$(free -h | grep Mem | awk '{print $7}')
        send_telegram_alert "🧠 <b>Orbo: Memory Alert</b>
Usage: ${MEM_USAGE}%
Available: ${MEM_FREE}"
    fi
else
    log "OK: Memory usage ${MEM_USAGE}%"
    clear_alert "mem_high"
fi

# ============================================
# 4. Docker Containers Check
# ============================================
for CONTAINER in orbo_app orbo_postgres orbo_nginx; do
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
        log "CRITICAL: Container $CONTAINER is not running"
        ISSUES=$((ISSUES + 1))
        if should_alert "container_${CONTAINER}" 10; then
            send_telegram_alert "🐳 <b>Orbo: Container DOWN</b>
Container: $CONTAINER"
        fi
    else
        clear_alert "container_${CONTAINER}"
    fi
done

# ============================================
# 5. Backup Check (was a backup created in last 26 hours?)
# ============================================
BACKUP_DIR="/home/deploy/orbo/backups"
LATEST_BACKUP=$(find "$BACKUP_DIR" -name "*.sql.gz" -mmin -1560 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    log "WARN: No backup found in last 26 hours"
    ISSUES=$((ISSUES + 1))
    if should_alert "backup_missing" 360; then
        send_telegram_alert "📦 <b>Orbo: Backup Alert</b>
No backup found in the last 26 hours.
Check: /home/deploy/orbo/backups/"
    fi
else
    log "OK: Recent backup exists"
    clear_alert "backup_missing"
fi

# ============================================
# Summary
# ============================================
if [ "$ISSUES" -eq 0 ]; then
    log "--- All checks passed ---"
else
    log "--- $ISSUES issue(s) detected ---"
fi
