#!/bin/bash

# Check Telegram Webhook Configuration
# This script checks the current webhook settings for the bot

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN environment variable is not set"
  exit 1
fi

echo "🔍 Checking Telegram webhook configuration..."
echo ""

# Get webhook info
echo "📋 Current webhook info:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq '.'

echo ""
echo "📋 Bot info:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" | jq '.'

echo ""
echo "💡 To set allowed updates for channels, run:"
echo "curl -X POST \"https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/setWebhook\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"url\": \"https://my.orbo.ru/api/telegram/webhook\", \"allowed_updates\": [\"message\", \"edited_message\", \"channel_post\", \"edited_channel_post\", \"message_reaction\", \"my_chat_member\", \"chat_member\"]}'"
