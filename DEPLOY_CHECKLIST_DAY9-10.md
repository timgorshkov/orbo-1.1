# Deploy Checklist: Day 9-10 AI Weekly Digest

**Дата:** 06.11.2025  
**Статус:** ✅ Реализация завершена

---

## 📋 Pre-Deploy Checklist

### 1. Database Migrations

**Проверить, что применены миграции 096-098:**
```sql
-- Check if migrations exist
SELECT * FROM pg_tables WHERE tablename = 'openai_api_logs';
SELECT * FROM pg_proc WHERE proname = 'generate_weekly_digest_data';
SELECT * FROM pg_proc WHERE proname = 'is_user_superadmin';
```

**Должны вернуть результаты.** Если нет, значит миграции не применены (но по документации они уже были применены до сбоя).

**Применить новую миграцию 099:**
```bash
# В Supabase SQL Editor
-- Запустить содержимое файла:
-- db/migrations/099_digest_settings.sql
```

**Verify:**
```sql
-- Check new columns exist
SELECT digest_enabled, digest_day, digest_time, last_digest_sent_at 
FROM organizations LIMIT 1;

-- Check index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'organizations' 
AND indexname = 'idx_orgs_digest_enabled';
```

---

### 2. Environment Variables

**В Vercel → Settings → Environment Variables проверить:**

```env
TELEGRAM_NOTIFICATIONS_BOT_TOKEN=your_bot_token_here
```

**Примечание:** Эта переменная уже должна быть настроена в системе для бота уведомлений.
Если её нет, нужно добавить токен notifications бота.

**Verify existing variables:**
- ✅ `OPENAI_API_KEY` - Должен быть настроен
- ✅ `CRON_SECRET` - Должен быть настроен
- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Должен быть настроен
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Должен быть настроен

---

### 3. Code Review

**Проверить файлы созданы:**
```bash
# Migrations
ls db/migrations/096_fix_openai_logs_select_policy.sql
ls db/migrations/097_openai_logs_rls_via_helper_function.sql
ls db/migrations/098_weekly_digest_data_rpc.sql
ls db/migrations/099_digest_settings.sql

# Services
ls lib/services/weeklyDigestService.ts
ls lib/templates/weeklyDigest.ts
ls lib/services/telegramNotificationService.ts

# API
ls app/api/cron/send-weekly-digests/route.ts
ls app/api/digest/test-send/route.ts
ls app/api/digest/preview/route.ts
ls app/api/digest/history/route.ts
ls app/api/organizations/[orgId]/digest-settings/route.ts

# UI
ls app/app/[org]/settings/digest/page.tsx
ls components/settings/digest-settings-form.tsx

# Config
cat vercel.json | grep send-weekly-digests
```

**Все файлы должны существовать.**

---

## 🚀 Deployment Steps

### Step 1: Deploy Code

```bash
git add .
git commit -m "Day 9-10: AI Weekly Digest implementation

- Added migrations 096-099 (OpenAI logs RLS + digest settings)
- Implemented weeklyDigestService with AI insights
- Created Telegram notification service
- Added cron job for automated digest sending
- Created digest settings UI
- Added test send functionality

Cost: ~$0.002-0.003 per digest
Bot: @orbo_assist_bot"

git push
```

**Vercel will auto-deploy.**

---

### Step 2: Apply Migration 099

**В Supabase Dashboard → SQL Editor:**

1. Открыть файл `db/migrations/099_digest_settings.sql`
2. Скопировать содержимое
3. Выполнить в SQL Editor
4. Проверить результат: должно вернуть "Migration 099 Complete"

---

### Step 3: Configure Bot

**Telegram Bot Setup:**
1. Найти ваш notifications bot в Telegram (уже должен быть настроен)
2. Отправить `/start`
3. Убедиться, что бот отвечает

**Примечание:** Notifications bot уже должен быть настроен в системе и webhook уже должен быть установлен.

---

### Step 4: Verify Cron Job

**В Vercel Dashboard → Settings → Cron Jobs:**
- Должен появиться `/api/cron/send-weekly-digests` с schedule `0 6 * * *`

**Test cron manually:**
```bash
curl -X GET "https://your-domain.vercel.app/api/cron/send-weekly-digests" \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Expected response:**
```json
{
  "success": true,
  "processed": 0,
  "successful": 0,
  "totalCost": "$0.0000",
  "results": []
}
```

(0 processed = correct if no orgs have digest scheduled for now)

---

## 🧪 Post-Deploy Testing

### Test 1: Settings Page

1. Открыть `https://your-domain.vercel.app/app/[orgId]/settings`
2. Должна появиться карточка "Еженедельный дайджест"
3. Кликнуть → должна открыться страница настроек
4. Проверить:
   - Toggle включить/выключить работает
   - Select день недели работает
   - Time picker работает
   - Кнопка "Сохранить" работает

**Expected:** Настройки сохраняются без ошибок

---

### Test 2: Link Telegram Account

**Prerequisites:** User must have Telegram linked to receive digest

1. Открыть профиль участника
2. Проверить, что `tg_user_id` заполнен
3. Если нет, связать Telegram аккаунт через:
   - `/app/[org]/members/[participantId]` → "Связать Telegram"

---

### Test 3: Test Send Digest

1. Открыть `https://your-domain.vercel.app/app/[orgId]/settings/digest`
2. Нажать "Отправить тестовый дайджест"
3. Должно появиться:
   - Loader "Отправка..."
   - Success message: "Дайджест отправлен! Стоимость: $0.00XX USD"

**Check Telegram:**
- Открыть @orbo_assist_bot в Telegram
- Должно прийти сообщение с дайджестом
- Проверить форматирование:
  - Emojis отображаются
  - Markdown форматирование корректно
  - Разделители видны
  - AI комментарии присутствуют (если >20 сообщений за неделю)

**Если ошибка "User has not started the bot":**
- Отправить `/start` боту @orbo_assist_bot в Telegram
- Повторить test send

---

### Test 4: Preview API

```bash
curl "https://your-domain.vercel.app/api/digest/preview?orgId=<ORG_ID>" \
  -H "Cookie: sb-access-token=<YOUR_TOKEN>"
```

**Expected response:**
```json
{
  "orgName": "Название",
  "keyMetrics": { "current": {...}, "previous": {...} },
  "topContributors": [...],
  "attentionZones": {...},
  "upcomingEvents": [...],
  "aiAnalysisEligible": true/false,
  "messageCount": 123
}
```

---

### Test 5: History API

```bash
curl "https://your-domain.vercel.app/api/digest/history?orgId=<ORG_ID>&limit=5" \
  -H "Cookie: sb-access-token=<YOUR_TOKEN>"
```

**Expected response:**
```json
{
  "history": [
    {
      "id": "...",
      "sentAt": "2025-11-06T...",
      "costUsd": 0.002,
      "costRub": 0.19
    }
  ],
  "settings": {
    "enabled": true,
    "day": 1,
    "time": "09:00:00",
    "lastSentAt": "2025-11-06T..."
  }
}
```

---

### Test 6: Check OpenAI Logs

**В Supabase → Table Editor → openai_api_logs:**

Должна появиться запись:
- `request_type` = `weekly_digest`
- `org_id` = ваш org ID
- `cost_usd` ≈ 0.002-0.003
- `total_tokens` ≈ 700-1000

---

### Test 7: Check Superadmin Page

1. Открыть `/superadmin/ai-costs`
2. Должна появиться запись с типом `weekly_digest`
3. Проверить стоимость: ~$0.002-0.003

---

## ⚠️ Troubleshooting

### Problem: "Bot not configured"
**Solution:** 
- Проверить, что `ORBO_ASSIST_BOT_TOKEN` добавлен в Vercel env
- Redeploy после добавления env variable

---

### Problem: "User has not started the bot"
**Solution:**
- Открыть @orbo_assist_bot в Telegram
- Отправить `/start`
- Повторить test send

---

### Problem: "No Telegram account linked"
**Solution:**
- Связать Telegram аккаунт через профиль участника
- Или использовать Telegram Login Widget

---

### Problem: Digest empty or missing AI comments
**Причина:** < 20 сообщений за неделю  
**Solution:** 
- Это нормально! AI комментарии появляются только при >= 20 сообщениях
- Fallback текст: "Недостаточно данных для AI-анализа"

---

### Problem: Cron not running
**Solution:**
- Check Vercel cron logs: Vercel Dashboard → Deployments → Functions → Cron
- Verify schedule: `0 6 * * *` (daily at 6 AM UTC)
- Test manually with curl + CRON_SECRET

---

### Problem: RPC function not found
**Причина:** Migration 098 не применена  
**Solution:**
```sql
-- Check if function exists
SELECT proname FROM pg_proc WHERE proname = 'generate_weekly_digest_data';

-- If empty, apply migration 098
-- db/migrations/098_weekly_digest_data_rpc.sql
```

---

## ✅ Success Criteria

- [x] Code deployed to Vercel
- [ ] Migration 099 applied to Supabase
- [ ] `ORBO_ASSIST_BOT_TOKEN` added to env
- [ ] Settings page loads without errors
- [ ] Test send successful (received in Telegram)
- [ ] AI comments generated (if >= 20 messages)
- [ ] OpenAI logs recorded with type `weekly_digest`
- [ ] Cron job visible in Vercel dashboard
- [ ] Manual cron test returns success

---

## 📊 Monitoring

**After 1 week, check:**
1. How many digests sent? (check `openai_api_logs`)
2. Total cost? (sum `cost_usd` from logs)
3. Any failures? (check Vercel function logs)
4. User feedback? (ask if they find it useful)

**Expected metrics:**
- Delivery rate: >95% (failures only if bot blocked)
- Cost per digest: $0.002-0.003
- User satisfaction: "Wow-effect" from AI insights ✨

---

**Status:** ✅ Ready to Deploy  
**Next:** Apply migration 099 → Deploy → Test → Monitor


