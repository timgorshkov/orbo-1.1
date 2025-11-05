# 📊 Day 3 Backend Analytics Implementation — COMPLETE

**Date:** Nov 5, 2025  
**Phase:** Backend (Database + RPC + Webhook)  
**Status:** ✅ Complete — Ready for frontend

---

## 🎯 Implemented Features

### 1. Database Schema Updates ✅

**Migration 084:** `analytics_support_schema.sql`

**Added:**
- `organizations.timezone` (default: 'Europe/Moscow') — for heatmap conversion
- `activity_events.reactions_count` (default: 0) — for fast aggregation
- `participant_groups.source` ('webhook_join', 'import', 'manual') — for newcomer detection
- 7 indexes for analytics performance optimization
- Updated existing messages with reactions_count from meta

**Indexes created:**
- `idx_activity_events_org_date` — for timeline queries
- `idx_activity_events_user_date` — for user activity queries
- `idx_activity_events_chat_date` — for group-specific queries
- `idx_activity_events_type_date` — for event type filtering
- `idx_participants_last_activity` — for engagement queries
- `idx_participant_groups_joined` — for newcomer queries

---

### 2. Analytics RPC Functions ✅

**Migration 085:** `analytics_rpc_functions.sql`

**Created 5 functions:**

#### 1. `get_activity_timeline(org_id, days, tg_chat_id)`
Returns daily activity with:
- message_count
- reaction_count
- active_users_count
- Timezone-aware dates

#### 2. `get_top_contributors(org_id, limit, tg_chat_id)`
Returns leaderboard with:
- current_week_score (messages + reactions)
- previous_week_score
- rank_change with labels: '↑ 3', '↓ 2', 'NEW', '—'

#### 3. `get_engagement_breakdown(org_id)`
Returns pie chart data with categories:
- Молчуны (no activity 30+ days)
- Новички (joined < 30 days, source = 'telegram')
- Ядро (old + recent activity, 3+ msgs/week)
- Опытные (old + recent activity, < 3 msgs/week)
- Остальные

**Priority:** Молчуны > Новички > Ядро > Опытные > Остальные

#### 4. `get_reactions_replies_stats(org_id, period_days, tg_chat_id)`
Returns comparison metrics:
- Current period: replies, reactions, messages, reply_ratio
- Previous period: same metrics
- Change percentages

#### 5. `get_activity_heatmap(org_id, days, tg_chat_id)`
Returns heatmap data with:
- day_of_week (0-6)
- day_name ('Пн', 'Вт', и т.д.)
- hour_interval (0-7, 3-hour blocks)
- hour_label ('00-03', '03-06', и т.д.)
- activity_count
- Timezone-aware

---

### 3. Reaction Events Processing ✅

**Migration 086:** `reactions_count_helper.sql`

**Created:**
- `increment_reactions_count(org_id, tg_chat_id, message_id, delta)` — helper RPC

**Modified:**
- `app/api/telegram/webhook/route.ts` — added message_reaction handling (Step 2.6)
- `lib/services/eventProcessingService.ts` — added `processReaction()` method

**Reaction workflow:**
1. Telegram sends `message_reaction` update
2. Webhook extracts reaction data (chat, message, user, old/new reactions)
3. EventProcessingService.processReaction():
   - Ensures participant exists
   - Calls `increment_reactions_count()` RPC (delta = new - old count)
   - Records reaction event in `activity_events`
   - Updates participant.last_activity_at
   - Updates group metrics
4. Separate `event_type = 'reaction'` records for analytics

**Message creation updated:**
- `processUserMessage()` now extracts reactions_count from message.reactions
- Stores in `activity_events.reactions_count`
- Adds to meta.reactions for detailed tracking

---

## 📋 Database Changes Summary

### New Columns:
```sql
organizations.timezone TEXT DEFAULT 'UTC'
activity_events.reactions_count INT DEFAULT 0
participant_groups.source TEXT DEFAULT 'webhook_join'
```

### New RPC Functions:
1. get_activity_timeline(UUID, INT, BIGINT)
2. get_top_contributors(UUID, INT, BIGINT)
3. get_engagement_breakdown(UUID)
4. get_reactions_replies_stats(UUID, INT, BIGINT)
5. get_activity_heatmap(UUID, INT, BIGINT)
6. increment_reactions_count(UUID, BIGINT, BIGINT, INT)

### New Indexes: 7

---

## 🧪 Testing Checklist

**Before Frontend Implementation:**

- [ ] Apply migrations 084, 085, 086 in Supabase SQL Editor
- [ ] Deploy webhook changes to Vercel
- [ ] Enable message_reaction updates in Telegram Bot API (setWebhook with allowed_updates)
- [ ] Test reaction webhook:
  - Add reaction to message → check activity_events for reaction event
  - Remove reaction → check reactions_count decremented
- [ ] Test RPC functions with sample org_id:
  - `SELECT * FROM get_activity_timeline('org-uuid', 30, NULL);`
  - `SELECT * FROM get_top_contributors('org-uuid', 10, NULL);`
  - `SELECT * FROM get_engagement_breakdown('org-uuid');`
  - `SELECT * FROM get_reactions_replies_stats('org-uuid', 14, NULL);`
  - `SELECT * FROM get_activity_heatmap('org-uuid', 30, NULL);`

---

## 🚀 Next Steps

### Frontend Implementation (Phase 2):

1. **Create API Routes** (30 min)
   - `/api/analytics/[orgId]/timeline/route.ts`
   - `/api/analytics/[orgId]/contributors/route.ts`
   - `/api/analytics/[orgId]/engagement/route.ts`
   - `/api/analytics/[orgId]/reactions-replies/route.ts`
   - `/api/analytics/[orgId]/heatmap/route.ts`

2. **Update Dashboard Page** (1.5 hours)
   - `app/app/[org]/dashboard/page.tsx`
   - Add 5 analytics sections
   - Group "Общая статистика" with "Динамика участников"
   - Leave "Зоны внимания" and "Ближайшие события" above fold

3. **Create Group Analytics Page** (1 hour)
   - `app/app/[org]/telegram/groups/[id]/analytics/page.tsx`
   - Add same 5 analytics sections (without engagement breakdown)
   - Add navigation link in group sidebar

4. **UI Components** (optional, 30 min)
   - Simple bar chart component (or use table initially)
   - Heatmap cell component with color gradient

---

## 📊 Analytics UI Specification (Reference)

### Dashboard (org-wide):
1. ✅ Активность участников (30 дней) — combo chart (bars + line)
2. ✅ Лидеры (топ-10, неделя) — bar chart with rank changes
3. ✅ Вовлечённость — pie chart (5 categories)
4. ✅ Реакции и ответы (14 дней) — metrics with comparison
5. ✅ Тепловая карта — 7 days × 8 intervals (3-hour blocks)

### Group Analytics (specific group):
1. ✅ Активность участников (30 дней)
2. ✅ Лидеры (топ-10, неделя)
3. ❌ Вовлечённость (excluded)
4. ✅ Реакции и ответы (14 дней)
5. ✅ Тепловая карта

### Existing Blocks:
- Group "Общая статистика" + "Динамика участников" → keep 4 metrics:
  - Всего участников
  - Новых участников
  - Сообщений за 7 дней
  - Коэффициент ответов
- Зоны внимания → keep (above fold)
- Ближайшие события → keep (above fold)
- Risk Radar (group page only) → keep

---

**Backend Complete! Ready for frontend.** 🎉  
**Time spent:** ~2 hours (schema + RPC + webhook + reaction processing)

