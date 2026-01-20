# Deploy Instructions: Channel Reactions Support

## Overview
This deployment adds support for channel reactions via `message_reaction_count` webhook updates.

## Why message_reaction_count?
Telegram sends `message_reaction` for **groups** (individual reactions with user IDs) but `message_reaction_count` for **channels** (aggregated anonymous reactions).

## Changes
1. ✅ Added `message_reaction_count` to all webhook setup endpoints
2. ✅ Added handler for `message_reaction_count` in webhook/route.ts  
3. ✅ Created RPC function `update_post_reactions_count` for database updates
4. ✅ Updated all `allowed_updates` lists

## Deployment Steps

### Step 1: Wait for GitHub Actions Deploy
```bash
# Check deployment status
ssh selectel-orbo 'docker ps | grep orbo_app'
ssh selectel-orbo 'docker logs -f orbo_app --tail 20'
```

### Step 2: Apply Database Migration
```bash
ssh selectel-orbo 'docker exec orbo_postgres psql -U postgres -d orbo -f /docker-entrypoint-initdb.d/203_update_post_reactions_count_rpc.sql'
```

**Or apply manually:**
```bash
ssh selectel-orbo
cd orbo
docker exec -i orbo_postgres psql -U postgres -d orbo < db/migrations/203_update_post_reactions_count_rpc.sql
```

**Verify migration:**
```bash
ssh selectel-orbo 'docker exec orbo_postgres psql -U postgres -d orbo -c "\df update_post_reactions_count"'
```

Expected output:
```
 Schema |            Name             | Result data type | Argument data types | Type 
--------+-----------------------------+------------------+---------------------+------
 public | update_post_reactions_count | void             | bigint, bigint, integer | func
```

### Step 3: Reset Webhook with New allowed_updates

**Option A: Via Superadmin UI (Recommended)**
1. Go to https://my.orbo.ru/superadmin/telegram
2. Select "Main Bot"
3. Click "Setup Webhook"
4. Check "Drop Pending Updates"
5. Click "Setup"

**Option B: Via Script**
```bash
ssh selectel-orbo 'cd orbo && export TELEGRAM_BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2 | tr -d "\"") && export TELEGRAM_WEBHOOK_SECRET=$(grep TELEGRAM_WEBHOOK_SECRET .env | cut -d= -f2 | tr -d "\"") && bash scripts/reset-webhook-for-channels.sh'
```

**Option C: Direct API Call**
```bash
ssh selectel-orbo '
export BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN ~/orbo/.env | cut -d= -f2 | tr -d "\"")
export SECRET=$(grep TELEGRAM_WEBHOOK_SECRET ~/orbo/.env | cut -d= -f2 | tr -d "\"")
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\":\"https://my.orbo.ru/api/telegram/webhook\",
    \"secret_token\":\"${SECRET}\",
    \"allowed_updates\":[
      \"message\",
      \"edited_message\",
      \"channel_post\",
      \"edited_channel_post\",
      \"message_reaction\",
      \"message_reaction_count\",
      \"my_chat_member\",
      \"chat_member\"
    ],
    \"max_connections\":40,
    \"drop_pending_updates\":true
  }" | jq .
'
```

### Step 4: Verify Webhook Configuration
```bash
ssh selectel-orbo '
export TELEGRAM_BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN ~/orbo/.env | cut -d= -f2 | tr -d "\"")
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq ".result.allowed_updates"
'
```

**Expected output:**
```json
[
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "message_reaction",
  "message_reaction_count",
  "my_chat_member",
  "chat_member"
]
```

### Step 5: Test Channel Reactions

1. **Publish a new post** in test channel `@timtestchannel_1`
   ```
   Test post for reactions #$(date +%s)
   ```

2. **Add 2-3 reactions** to the post (👍 ❤️ 🔥)

3. **Check logs** for webhook processing:
   ```bash
   ssh selectel-orbo 'docker logs -f orbo_app | grep "WEBHOOK\|CHANNEL\|message_reaction_count"'
   ```

4. **Expected log output:**
   ```
   📨 [WEBHOOK] Received update - update_types: ["message_reaction_count"]
   📊 [WEBHOOK] Received message_reaction_count - chat_type: channel
   ✅ [WEBHOOK] Post reactions count updated
   ```

5. **Verify in database:**
   ```bash
   ssh selectel-orbo 'docker exec orbo_postgres psql -U postgres -d orbo -c "SELECT tg_message_id, text, reactions_count FROM channel_posts ORDER BY posted_at DESC LIMIT 5;"'
   ```

### Step 6: Check Channel Analytics UI

1. Go to https://my.orbo.ru/p/[org]/telegram/channels
2. Click on test channel
3. Verify reactions count is displayed in:
   - Overall statistics
   - Top posts list
   - Daily analytics chart

## Rollback Plan

If issues occur, revert webhook to previous settings:
```bash
ssh selectel-orbo '
export BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN ~/orbo/.env | cut -d= -f2 | tr -d "\"")
export SECRET=$(grep TELEGRAM_WEBHOOK_SECRET ~/orbo/.env | cut -d= -f2 | tr -d "\"")
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\":\"https://my.orbo.ru/api/telegram/webhook\",
    \"secret_token\":\"${SECRET}\",
    \"allowed_updates\":[
      \"message\",
      \"edited_message\",
      \"channel_post\",
      \"edited_channel_post\",
      \"message_reaction\",
      \"my_chat_member\",
      \"chat_member\"
    ],
    \"max_connections\":40
  }"
'
```

## Troubleshooting

### No message_reaction_count in logs
- Check webhook allowed_updates (Step 4)
- Ensure bot is admin in channel
- Try adding reactions again (Telegram might cache permissions)

### RPC function not found
- Apply migration (Step 2)
- Check function exists: `\df update_post_reactions_count`

### reactions_count not updating in database
- Check logs for errors: `docker logs orbo_app | grep "update_post_reactions_count"`
- Check RPC function grants
- Verify channel and post exist in database

## Success Criteria
- [x] Webhook has `message_reaction_count` in allowed_updates
- [x] Migration 203 applied successfully
- [x] Logs show `📊 [WEBHOOK] Received message_reaction_count`
- [x] `channel_posts.reactions_count` updates in database
- [x] Reactions displayed in channel analytics UI
