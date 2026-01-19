#!/bin/bash

# Script to manually reset Telegram webhook with channel support
# Usage: ./scripts/reset-webhook-for-channels.sh

# Check if TELEGRAM_BOT_TOKEN is set
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Error: TELEGRAM_BOT_TOKEN environment variable is not set."
  echo "Please set it before running the script: export TELEGRAM_BOT_TOKEN=\"YOUR_BOT_TOKEN\""
  exit 1
fi

# Check if TELEGRAM_WEBHOOK_SECRET is set
if [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
  echo "Error: TELEGRAM_WEBHOOK_SECRET environment variable is not set."
  echo "Please set it before running the script: export TELEGRAM_WEBHOOK_SECRET=\"YOUR_SECRET\""
  exit 1
fi

WEBHOOK_URL="${WEBHOOK_URL:-https://my.orbo.ru/api/telegram/webhook}"

echo "Setting webhook for bot with token starting with ${TELEGRAM_BOT_TOKEN:0:5}..."
echo "Webhook URL: $WEBHOOK_URL"
echo ""

# Set webhook with full allowed_updates including channels
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$WEBHOOK_URL\",
    \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET\",
    \"allowed_updates\": [
      \"message\",
      \"edited_message\",
      \"channel_post\",
      \"edited_channel_post\",
      \"message_reaction\",
      \"my_chat_member\",
      \"chat_member\"
    ],
    \"max_connections\": 40,
    \"drop_pending_updates\": false
  }" | jq .

echo ""
echo "Verifying webhook info:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq .

echo ""
echo "✅ Done! Check allowed_updates in the response above."
