#!/bin/bash
# Setup cron jobs for Orbo on the server
# Run this script on the server: bash ~/orbo/scripts/setup-cron.sh

set -e

# Load environment variables
source ~/orbo/.env

# Check required variables
if [ -z "$CRON_SECRET" ]; then
    echo "Error: CRON_SECRET not set in .env"
    exit 1
fi

APP_URL="${NEXT_PUBLIC_APP_URL:-https://my.orbo.ru}"

echo "Setting up cron jobs for Orbo..."
echo "APP_URL: $APP_URL"

# All cron scripts use runtime .env loading (secrets NOT inlined)
CRON_SCRIPTS=(
    "cron-error-digest.sh|GET|/api/cron/error-digest"
    "cron-group-metrics.sh|GET|/api/cron/update-group-metrics"
    "cron-notification-rules.sh|GET|/api/cron/check-notification-rules"
    "cron-sync-attention-zones.sh|POST|/api/cron/sync-attention-zones"
    "cron-send-announcements.sh|POST|/api/cron/send-announcements"
    "cron-send-event-reminders.sh|GET|/api/cron/send-event-reminders"
    "cron-send-weekly-digests.sh|GET|/api/cron/send-weekly-digests"
    "cron-notification-health-check.sh|GET|/api/cron/notification-health-check"
    "cron-send-onboarding.sh|POST|/api/cron/send-onboarding"
    "cron-check-billing.sh|POST|/api/cron/check-billing"
    "cron-check-memberships.sh|GET|/api/cron/check-memberships"
    "cron-charge-recurring.sh|POST|/api/cron/charge-recurring"
)

for entry in "${CRON_SCRIPTS[@]}"; do
    IFS='|' read -r filename method endpoint <<< "$entry"
    METHOD_FLAG=""
    if [ "$method" = "POST" ]; then
        METHOD_FLAG="-X POST "
    fi
    cat > ~/orbo/$filename << 'SCRIPT_EOF'
#!/bin/bash
ENV_FILE=~/orbo/.env
if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^(CRON_SECRET|NEXT_PUBLIC_APP_URL)=' "$ENV_FILE" | xargs)
fi
APP_URL="${NEXT_PUBLIC_APP_URL:-https://my.orbo.ru}"
if [ -z "$CRON_SECRET" ]; then
  echo "$(date): CRON_SECRET not set, skipping" >> /var/log/orbo-cron.log
  exit 1
fi
SCRIPT_EOF
    # Append the curl command (with variables that will be evaluated at runtime)
    echo "curl -s ${METHOD_FLAG}-H \"Authorization: Bearer \$CRON_SECRET\" \"\$APP_URL${endpoint}\" >> /var/log/orbo-cron.log 2>&1" >> ~/orbo/$filename
    chmod 700 ~/orbo/$filename
    echo "Created ~/orbo/$filename (chmod 700)"
done

# Create cron script for check-webhook (every 30 minutes)
# Checks and auto-restores Telegram + MAX bot webhooks if they go missing
# Uses single-quoted 'EOF' so variables are NOT expanded at write time — they
# are loaded from .env at runtime, avoiding empty-secret bugs.
cat > ~/orbo/cron-check-webhook.sh << 'EOF'
#!/bin/bash
# Load env vars from app .env file
ENV_FILE=~/orbo/.env
if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^(CRON_SECRET|NEXT_PUBLIC_APP_URL)=' "$ENV_FILE" | xargs)
fi
APP_URL="${NEXT_PUBLIC_APP_URL:-https://my.orbo.ru}"
if [ -z "$CRON_SECRET" ]; then
  echo "$(date): CRON_SECRET not set, skipping check-webhook" >> /var/log/orbo-cron.log
  exit 1
fi
curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/check-webhook" >> /var/log/orbo-cron.log 2>&1
EOF
chmod 700 ~/orbo/cron-check-webhook.sh

# Create crontab file (more reliable than pipe)
CRONTAB_FILE=~/orbo/orbo-crontab

# Get existing crontab entries (excluding our jobs).
# IMPORTANT: also exclude the maintenance jobs we re-add below (backup,
# health-monitor, docker cleanup, the "DO NOT EDIT MANUALLY" header) and the
# explanatory comment lines — otherwise re-running this script duplicates
# them, which already caused parallel backup runs and corrupted dumps.
crontab -l 2>/dev/null \
  | grep -v "cron-error-digest" \
  | grep -v "cron-group-metrics" \
  | grep -v "cron-notification-rules" \
  | grep -v "cron-sync-attention-zones" \
  | grep -v "cron-send-announcements" \
  | grep -v "cron-send-event-reminders" \
  | grep -v "cron-send-weekly-digests" \
  | grep -v "cron-notification-health-check" \
  | grep -v "cron-send-onboarding" \
  | grep -v "cron-check-billing" \
  | grep -v "cron-check-webhook" \
  | grep -v "cron-check-memberships" \
  | grep -v "cron-charge-recurring" \
  | grep -v "health-monitor.sh" \
  | grep -v "backup.sh >> " \
  | grep -v "docker builder prune" \
  | grep -v "docker image prune" \
  | grep -vF "# Orbo cron jobs - DO NOT EDIT MANUALLY" \
  | grep -vF "# Health monitoring (every 5 minutes)" \
  | grep -vF "# Database backup (daily 3 AM, with S3 upload)" \
  | grep -vF "# Maintenance: Docker cleanup weekly" \
  > "$CRONTAB_FILE" || true

# Add our cron jobs
cat >> "$CRONTAB_FILE" << CRON
# Orbo cron jobs - DO NOT EDIT MANUALLY
0 * * * * ~/orbo/cron-error-digest.sh
*/5 * * * * ~/orbo/cron-group-metrics.sh
*/15 * * * * ~/orbo/cron-notification-rules.sh
0 * * * * ~/orbo/cron-sync-attention-zones.sh
*/5 * * * * ~/orbo/cron-send-announcements.sh
0 * * * * ~/orbo/cron-send-event-reminders.sh
0 */3 * * * ~/orbo/cron-send-weekly-digests.sh
0 */6 * * * ~/orbo/cron-notification-health-check.sh
*/15 * * * * ~/orbo/cron-send-onboarding.sh
0 9 * * * ~/orbo/cron-check-billing.sh
*/5 * * * * ~/orbo/cron-check-webhook.sh
0 * * * * ~/orbo/cron-check-memberships.sh
30 9 * * * ~/orbo/cron-charge-recurring.sh
# Health monitoring (every 5 minutes)
*/5 * * * * /home/deploy/orbo/scripts/health-monitor.sh >> /var/log/orbo-health.log 2>&1
# Database backup (daily 3 AM, with S3 upload)
0 3 * * * /home/deploy/orbo/scripts/backup.sh >> /home/deploy/orbo/scripts/backup.log 2>&1
# Maintenance: Docker cleanup weekly
0 4 * * 0 docker builder prune -f --filter until=168h >> /var/log/orbo-cron.log 2>&1 && docker image prune -f >> /var/log/orbo-cron.log 2>&1
CRON

# Install crontab from file
crontab "$CRONTAB_FILE"

# Verify installation
echo ""
echo "📋 Installed crontab:"
crontab -l

echo ""
echo "✅ Cron jobs configured!"
echo ""
echo "📊 Group Metrics Update:"
echo "   Schedule: Every 5 minutes"
echo "   Command: ~/orbo/cron-group-metrics.sh"
echo ""
echo "🔔 Notification Rules Check:"
echo "   Schedule: Every 15 minutes"
echo "   Command: ~/orbo/cron-notification-rules.sh"
echo ""
echo "🎯 Sync Attention Zones:"
echo "   Schedule: Every hour at :00"
echo "   Command: ~/orbo/cron-sync-attention-zones.sh"
echo ""
echo "📧 Error Digest:"
echo "   Schedule: Every hour at :00"
echo "   Command: ~/orbo/cron-error-digest.sh"
echo ""
echo "📢 Send Announcements:"
echo "   Schedule: Every minute"
echo "   Command: ~/orbo/cron-send-announcements.sh"
echo ""
echo "🔔 Send Event Reminders (Personal DMs via @orbo_community_bot):"
echo "   Schedule: Every hour at :00"
echo "   Command: ~/orbo/cron-send-event-reminders.sh"
echo ""
echo "🏥 Notification Health Self-Check:"
echo "   Schedule: Every 6 hours"
echo "   Command: ~/orbo/cron-notification-health-check.sh"
echo ""
echo "🔗 Webhook Health Check (Telegram + MAX):"
echo "   Schedule: Every 30 minutes"
echo "   Command: ~/orbo/cron-check-webhook.sh"
echo ""
echo "📋 Management:"
echo "   View logs: tail -f /var/log/orbo-cron.log"
echo "   View crontab: crontab -l"
echo "   Test webhook check: curl -H 'Authorization: Bearer \$CRON_SECRET' $APP_URL/api/cron/check-webhook"
