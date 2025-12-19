#!/bin/bash
# Cron job for syncing attention zones
# Runs every hour to populate attention_zone_items table

CRON_SECRET="${CRON_SECRET:-}"
APP_URL="${APP_URL:-http://localhost:3000}"

if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET not set"
  exit 1
fi

curl -s -X POST "${APP_URL}/api/cron/sync-attention-zones" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json"

