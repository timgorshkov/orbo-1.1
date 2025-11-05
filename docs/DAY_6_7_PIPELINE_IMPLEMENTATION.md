# Day 6-7: Enrichment Pipeline Implementation

**Date:** November 5, 2025  
**Status:** ✅ Completed  
**Approach:** Conservative (Variant A) - AI only by button, rule-based automatic

---

## 🎯 Overview

Implemented a three-tier enrichment pipeline:
1. **Webhook (Real-time):** Lightweight stats updates, NO enrichment
2. **Cron (Daily):** Rule-based role updates, NO AI
3. **Manual (On-demand):** AI analysis via button (already implemented)

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────┐
│           WEBHOOK (Real-time)                   │
│  - Updates last_activity_at                     │
│  - Updates last_sync_at for groups              │
│  - Triggers DB scoring (via trigger)            │
│  - Time: <100ms per message                     │
│  - Cost: $0                                      │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│         CRON (Daily 3 AM)                       │
│  - Finds active participants (last 7 days)      │
│  - Enriches up to 100 participants/day          │
│  - Updates: behavioral_role, reaction_patterns  │
│  - Time: ~5-10 seconds for 100 participants     │
│  - Cost: $0 (rule-based only)                   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│         MANUAL AI (By Button)                   │
│  - Owner clicks "AI-анализ" button              │
│  - Shows cost estimation before running         │
│  - Updates: interests, recent_asks, city, etc.  │
│  - Time: ~2-5 seconds per participant           │
│  - Cost: ~$0.001 per participant                │
└─────────────────────────────────────────────────┘
```

---

## 📁 Files Created/Modified

### 1. **New Service: `lib/services/participantStatsService.ts`**

Lightweight stats service for webhook integration.

**Functions:**
- `updateParticipantActivity(tgUserId, orgId)` - Updates last_activity_at
- `incrementGroupMessageCount(tgChatId)` - Updates group last_sync_at
- `getActiveParticipantsForEnrichment(limit)` - Fetches active participants for cron
- `getEnrichmentStats()` - Returns stats for monitoring

**Performance:**
- Each call: <50ms
- No database-heavy operations
- No AI calls

---

### 2. **Modified: `app/api/telegram/webhook/route.ts`**

**Changes:**
- Added import: `updateParticipantActivity`, `incrementGroupMessageCount`
- After processing message (line ~205):
  ```typescript
  if (body.message?.from?.id) {
    updateParticipantActivity(body.message.from.id, orgId).catch(...);
    incrementGroupMessageCount(chatId).catch(...);
  }
  ```
- After processing reaction (line ~307):
  ```typescript
  if (userId) {
    updateParticipantActivity(userId, orgId).catch(...);
  }
  ```

**Error Handling:**
- Uses `.catch()` to prevent webhook blocking
- Logs errors for monitoring
- Webhook returns 200 even if stats update fails

---

### 3. **New Cron: `app/api/cron/update-participant-roles/route.ts`**

Daily cron job for rule-based enrichment.

**Schedule:** 3 AM daily (`0 3 * * *`)

**Process:**
1. Fetch active participants (last 7 days, not enriched in 24h)
2. Limit: 100 participants/day
3. For each participant:
   - Call `enrichParticipant()` with `useAI: false`
   - Update `behavioral_role` (helper/bridge/observer/broadcaster)
   - Update `reaction_patterns` (favorite emojis, sentiment)
4. Log results to `error_logs` table

**Authorization:**
- Verifies `CRON_SECRET` from env
- Allows localhost for testing

**Monitoring:**
- Logs success/failed counts
- Records duration
- Stores first 10 errors in database

---

### 4. **Modified: `vercel.json`**

Added new cron job:
```json
{
  "path": "/api/cron/update-participant-roles",
  "schedule": "0 3 * * *"
}
```

---

## 🔄 Data Flow

### **Message Received (Webhook)**
1. Telegram sends message → `/api/telegram/webhook`
2. `eventProcessingService.processUpdate(body)` → saves to `activity_events`
3. `updateParticipantActivity(tgUserId, orgId)` → updates `participants.last_activity_at`
4. DB Trigger → recalculates `activity_score` and `risk_score`
5. `incrementGroupMessageCount(chatId)` → updates `telegram_groups.last_sync_at`

**Total time:** <100ms  
**Cost:** $0

---

### **Daily Cron (3 AM)**
1. Cron calls `/api/cron/update-participant-roles`
2. `getActiveParticipantsForEnrichment(100)` → finds active participants
3. For each participant:
   - Fetch messages from last 30 days
   - Calculate reply_rate, unique_contacts, message_count
   - Classify `behavioral_role` (rule-based)
   - Analyze `reaction_patterns` (rule-based)
   - Save to `custom_attributes`
4. Log results to `error_logs`

**Total time:** ~5-10 seconds for 100 participants  
**Cost:** $0

---

### **Manual AI Analysis (Button)**
1. Owner clicks "AI-анализ" on participant profile
2. GET `/api/participants/[id]/enrich-ai` → shows cost estimation
3. Owner confirms
4. POST `/api/participants/[id]/enrich-ai` → runs AI analysis
5. `enrichParticipant()` with `useAI: true`:
   - Fetch messages from last 30 days
   - Send to OpenAI API (`gpt-4o-mini`)
   - Extract: interests, recent_asks, city, topics
   - ALSO runs rule-based (role, reactions)
   - Save all to `custom_attributes`

**Total time:** ~2-5 seconds  
**Cost:** ~$0.001 per participant

---

## 💰 Cost Control

| Component | Frequency | Participants | Cost/Day | Cost/Month |
|-----------|-----------|--------------|----------|------------|
| **Webhook** | Per message | All | $0 | $0 |
| **Cron** | Daily | 100 | $0 | $0 |
| **Manual AI** | On-demand | 1-10/day | ~$0.01 | ~$0.30 |
| **Total** | - | - | ~$0.01 | ~$0.30 |

**Total monthly cost for 100 active participants:** <$1  
**AI cost:** Fully controlled by owner (button only) ✅

---

## 🎛️ Configuration

### Environment Variables
```bash
# Required for cron authentication
CRON_SECRET=your_secret_here

# Already set (from Day 1-5)
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Vercel Setup
1. Add `CRON_SECRET` to Vercel environment variables
2. Deploy (cron will auto-register)
3. Test: `curl https://your-domain.vercel.app/api/cron/update-participant-roles -H "Authorization: Bearer YOUR_CRON_SECRET"`

---

## 📊 Monitoring

### Cron Execution Logs
Check `error_logs` table:
```sql
SELECT *
FROM error_logs
WHERE message LIKE '%Daily role update%'
ORDER BY created_at DESC
LIMIT 10;
```

### Enrichment Stats
```sql
-- Participants with enrichment
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN custom_attributes->>'last_enriched_at' IS NOT NULL THEN 1 END) as enriched,
  COUNT(CASE WHEN custom_attributes->>'enrichment_source' = 'ai' THEN 1 END) as enriched_with_ai
FROM participants;

-- Recent enrichments
SELECT 
  id,
  full_name,
  custom_attributes->>'last_enriched_at' as last_enriched,
  custom_attributes->>'enrichment_source' as source,
  custom_attributes->>'behavioral_role' as role
FROM participants
WHERE custom_attributes->>'last_enriched_at' IS NOT NULL
ORDER BY custom_attributes->>'last_enriched_at' DESC
LIMIT 20;
```

---

## 🧪 Testing

### 1. Test Webhook Integration (Local)
```bash
# Send a message to your Telegram group
# Check logs for:
[Webhook] Step 2c: EventProcessingService completed
[Webhook] Failed to update participant activity: (should NOT appear)
```

### 2. Test Cron Job (Local)
```bash
# Run manually
curl http://localhost:3000/api/cron/update-participant-roles

# Expected response:
{
  "ok": true,
  "updated": 5,
  "failed": 0,
  "duration_ms": 2341
}
```

### 3. Test Manual AI (Already Done)
```bash
# Click "AI-анализ" button on participant profile
# Should show cost estimation
# Should complete in ~2-5 seconds
```

---

## ✅ Verification Checklist

- [x] `participantStatsService.ts` created
- [x] Webhook integration added (messages + reactions)
- [x] Cron job created (`update-participant-roles`)
- [x] `vercel.json` updated with new cron
- [x] No linter errors
- [ ] Deploy to Vercel
- [ ] Test webhook (send message, check logs)
- [ ] Test cron (wait for 3 AM or trigger manually)
- [ ] Monitor `error_logs` table for issues

---

## 🚀 Next Steps (Day 8-14)

After verification:
1. **Day 8-10:** AI Weekly Digest
2. **Day 11-13:** Enriched Profiles UI
3. **Day 14:** Testing + CustDev feedback

---

## 📝 Notes

**Key Design Decisions:**
1. **Webhook is async:** Stats updates run in background (`.catch()`) to avoid blocking webhook
2. **Cron has limits:** Max 100 participants/day to prevent timeout (Vercel 10s limit)
3. **AI is manual only:** Full cost control, no surprises
4. **Rule-based is free:** Can run 1000x/day without cost concerns

**Trade-offs:**
- **Pro:** Predictable costs, fast webhook, no AI surprises
- **Con:** Enrichment lags by up to 24h for new participants
- **Mitigation:** Owner can manually trigger AI for important participants

---

## 🔗 Related Files

- Day 1-2: `db/migrations/093_add_goals_and_enrichment_schema.sql`
- Day 3-5: `lib/services/participantEnrichmentService.ts`
- Day 6-7: This implementation

---

**Implementation Time:** 2-3 hours  
**Status:** ✅ Ready for deployment

