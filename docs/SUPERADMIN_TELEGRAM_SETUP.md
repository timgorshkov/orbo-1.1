# 📱 Superadmin Telegram Setup

**Date:** Nov 5, 2025  
**Feature:** Webhook configuration UI in Superadmin panel

---

## 🎯 What Was Implemented

### 1. Fixed `message_reaction` in allowed_updates ✅

**Problem:** `message_reaction` events were not included in webhook configuration

**Fixed files:**
- `lib/services/webhookRecoveryService.ts` — added `'message_reaction'` to main bot
- `lib/services/telegramService.ts` — added `'message_reaction'` to setWebhook()

**Now auto-recovery includes:**
```typescript
allowed_updates: ['message', 'chat_member', 'my_chat_member', 'message_reaction']
```

---

### 2. Created Webhook Setup API ✅

**File:** `app/api/superadmin/telegram/setup-webhook/route.ts`

**Endpoints:**

#### POST `/api/superadmin/telegram/setup-webhook`
Manually configures webhook for a bot.

**Request:**
```json
{
  "botType": "main" | "notifications"
}
```

**Response:**
```json
{
  "success": true,
  "botType": "main",
  "webhook": {
    "url": "https://app.orbo.ru/api/telegram/webhook",
    "hasCustomCertificate": false,
    "pendingUpdateCount": 0,
    "maxConnections": 40,
    "allowedUpdates": ["message", "chat_member", "my_chat_member", "message_reaction"]
  }
}
```

#### GET `/api/superadmin/telegram/setup-webhook`
Returns current webhook info for both bots.

**Response:**
```json
{
  "main": { /* WebhookInfo */ },
  "notifications": { /* WebhookInfo */ }
}
```

---

### 3. Created Superadmin Telegram Page ✅

**Page:** `app/superadmin/telegram/page.tsx`

**Components:**
1. **WebhookSetup** — configure webhooks with buttons
2. **TelegramHealthStatus** — monitoring (moved from Groups page)

**Features:**
- ✅ One-click webhook setup for each bot
- ✅ Real-time webhook status display
- ✅ Shows allowed_updates, pending count, errors
- ✅ Refresh button for latest info
- ✅ Warning about message_reaction requirement

**Navigation:** Added "Telegram" tab to superadmin layout

---

### 4. Moved Health Monitoring ✅

**From:** `app/superadmin/groups/page.tsx`  
**To:** `app/superadmin/telegram/page.tsx`

**Reasoning:** Telegram configuration and monitoring belong together in a dedicated section.

---

## 🚀 How to Use

### Step 1: Access Superadmin Telegram Page

1. Login as superadmin
2. Navigate to `/superadmin/telegram`
3. You'll see 2 cards: Main Bot and Notifications Bot

### Step 2: Setup Webhook

**For Main Bot:**
1. Click "Setup Webhook" button under "Main Bot"
2. Wait for confirmation
3. Verify "Allowed Updates" includes `message_reaction`

**For Notifications Bot (if needed):**
1. Click "Setup Webhook" button under "Notifications Bot"
2. Wait for confirmation

### Step 3: Verify

- ✅ Status badge shows "✅ Настроен"
- ✅ URL is correct: `https://app.orbo.ru/api/telegram/webhook`
- ✅ Allowed Updates includes: `message`, `my_chat_member`, `chat_member`, `message_reaction`
- ✅ No pending updates or errors

---

## 📋 URL for Manual Setup

**Direct Link (after deployment):**
```
https://app.orbo.ru/superadmin/telegram
```

**Or via curl (if needed):**
```bash
# Get current status
curl "https://app.orbo.ru/api/superadmin/telegram/setup-webhook" \
  -H "Cookie: sb-access-token=YOUR_TOKEN"

# Setup main bot
curl -X POST "https://app.orbo.ru/api/superadmin/telegram/setup-webhook" \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=YOUR_TOKEN" \
  -d '{"botType":"main"}'
```

---

## 🧪 Testing Checklist

After deployment:

- [ ] Access `/superadmin/telegram` page
- [ ] Click "Setup Webhook" for Main Bot
- [ ] Verify webhook configuration:
  - [ ] Status: ✅ Настроен
  - [ ] URL: correct
  - [ ] Allowed Updates: includes `message_reaction`
  - [ ] No errors
- [ ] Test reaction webhook:
  - [ ] Add reaction to a message in connected group
  - [ ] Check Vercel logs for `[Webhook] Step 2.6: Reaction received`
  - [ ] Check `activity_events` for new record with `event_type = 'reaction'`
- [ ] Check Health Monitoring section displays correctly

---

## 🐛 Troubleshooting

### Webhook not configured
**Solution:** Click "Setup Webhook" button

### `message_reaction` missing from allowed_updates
**Solution:** 
1. Redeploy with updated code
2. Click "Setup Webhook" again (it will overwrite)

### "Forbidden: Superadmin access required"
**Solution:** Ensure your user has `superadmin.is_active = true` in database

### Webhook shows errors
**Check:**
- Vercel logs for detailed error messages
- `error_logs` table in Supabase
- `telegram_health_events` table

---

## 📂 Files Created/Modified

### New Files:
- `app/api/superadmin/telegram/setup-webhook/route.ts`
- `app/superadmin/telegram/page.tsx`
- `components/superadmin/webhook-setup.tsx`
- `docs/SUPERADMIN_TELEGRAM_SETUP.md` (this file)

### Modified Files:
- `lib/services/webhookRecoveryService.ts` — added `message_reaction`
- `lib/services/telegramService.ts` — added `message_reaction`
- `app/superadmin/groups/page.tsx` — removed TelegramHealthStatus
- `app/superadmin/layout.tsx` — added Telegram nav link

---

**Ready to deploy and test!** 🚀

