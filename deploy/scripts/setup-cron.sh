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

# Create cron script for error-digest (hourly)
cat > ~/orbo/cron-error-digest.sh << EOF
#!/bin/bash
curl -s -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/error-digest" >> /var/log/orbo-cron.log 2>&1
EOF
chmod +x ~/orbo/cron-error-digest.sh

# Create cron script for group-metrics (every 5 minutes)
cat > ~/orbo/cron-group-metrics.sh << EOF
#!/bin/bash
curl -s -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/update-group-metrics" >> /var/log/orbo-cron.log 2>&1
EOF
chmod +x ~/orbo/cron-group-metrics.sh

# Create cron script for notification-rules (every 15 minutes)
cat > ~/orbo/cron-notification-rules.sh << EOF
#!/bin/bash
curl -s -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/check-notification-rules" >> /var/log/orbo-cron.log 2>&1
EOF
chmod +x ~/orbo/cron-notification-rules.sh

# Create cron script for sync-attention-zones (hourly)
cat > ~/orbo/cron-sync-attention-zones.sh << EOF
#!/bin/bash
curl -s -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/sync-attention-zones" >> /var/log/orbo-cron.log 2>&1
EOF
chmod +x ~/orbo/cron-sync-attention-zones.sh

# Remove old cron entries and add new ones
(crontab -l 2>/dev/null | grep -v "cron-error-digest" | grep -v "cron-group-metrics" | grep -v "cron-notification-rules" | grep -v "cron-sync-attention-zones" ; \
  echo "0 * * * * ~/orbo/cron-error-digest.sh" ; \
  echo "*/5 * * * * ~/orbo/cron-group-metrics.sh" ; \
  echo "*/15 * * * * ~/orbo/cron-notification-rules.sh" ; \
  echo "0 * * * * ~/orbo/cron-sync-attention-zones.sh") | crontab -

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
echo "📋 Management:"
echo "   View logs: tail -f /var/log/orbo-cron.log"
echo "   View crontab: crontab -l"
echo "   Test sync-attention-zones: curl -X POST -H 'x-cron-secret: \$CRON_SECRET' $APP_URL/api/cron/sync-attention-zones"
