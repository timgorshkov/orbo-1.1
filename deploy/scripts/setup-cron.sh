#!/bin/bash
# Setup cron job for error-digest on the server
# Run this script on the server: bash ~/orbo/deploy/scripts/setup-cron.sh

set -e

# Load environment variables
source ~/orbo/.env

# Check required variables
if [ -z "$CRON_SECRET" ]; then
    echo "Error: CRON_SECRET not set in .env"
    exit 1
fi

APP_URL="${NEXT_PUBLIC_APP_URL:-https://my.orbo.ru}"

# Create cron script
cat > ~/orbo/cron-error-digest.sh << EOF
#!/bin/bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/error-digest" >> /var/log/orbo-cron.log 2>&1
EOF

chmod +x ~/orbo/cron-error-digest.sh

# Add to crontab (every hour at minute 0)
(crontab -l 2>/dev/null | grep -v "cron-error-digest" ; echo "0 * * * * ~/orbo/cron-error-digest.sh") | crontab -

echo "✅ Cron job configured!"
echo "   Schedule: Every hour at :00"
echo "   Command: ~/orbo/cron-error-digest.sh"
echo ""
echo "   View logs: tail -f /var/log/orbo-cron.log"
echo "   View crontab: crontab -l"

