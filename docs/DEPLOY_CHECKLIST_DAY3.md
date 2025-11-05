# Day 3 Deployment Checklist

**Date:** November 5, 2025  
**Status:** ✅ Ready to Deploy

---

## 📋 **Quick Summary:**

### Fixed Today:
1. ✅ Timeline empty → **Migration 088** (use org_telegram_groups)
2. ✅ Wrong participant count → **Migration 088** (count DISTINCT tg_user_id)
3. ✅ Replies not counted → **Migration 089** (use reply_to_message_id column)
4. ✅ Contributors wrong sort → **Migration 090** (ORDER BY rank ASC)
5. ✅ "Основные метрики" block → **Migration 091** (6 metrics with comparison)
6. ✅ Heatmap too tall → Frontend (h-8 → h-5)
7. ✅ Attention zones diagnostic → SQL script

---

## 🚀 **Deployment Steps:**

### Step 1: Backend Migrations (in Supabase SQL Editor)

Run these migrations **in order**:

#### Migration 088 - Analytics Org ID Logic
```sql
-- File: db/migrations/088_fix_analytics_org_id_logic.sql
-- Purpose: Fix timeline, engagement, contributors using org_telegram_groups
-- Time: ~5 seconds
```
**⚠️ Critical:** Re-creates all 5 analytics RPC functions

#### Migration 089 - Replies Counting
```sql
-- File: db/migrations/089_fix_replies_counting.sql
-- Purpose: Fix replies counting using reply_to_message_id column
-- Time: ~2 seconds
```

#### Migration 090 - Contributors Sort Order
```sql
-- File: db/migrations/090_fix_contributors_sort_order.sql
-- Purpose: Fix top contributors sort (1→10 instead of 10→1)
-- Time: ~2 seconds
```

#### Migration 091 - Key Metrics Function
```sql
-- File: db/migrations/091_key_metrics_function.sql
-- Purpose: Create get_key_metrics RPC with 6 metrics
-- Time: ~2 seconds
-- Note: Includes DROP FUNCTION IF EXISTS (safe to re-run)
```

#### Migration 092 - Fix Inactive Newcomers (HOTFIX)
```sql
-- File: db/migrations/092_fix_inactive_newcomers_ambiguity.sql
-- Purpose: Fix "column reference created_at is ambiguous" error
-- Time: ~2 seconds
-- Note: Includes DROP FUNCTION IF EXISTS (safe to re-run)
```

**Total migration time:** ~20 seconds

---

### Step 2: Frontend Deployment

```bash
git add .
git commit -m "fix: Analytics dashboard - Day 3 complete fixes

- Migration 088: org_id logic + participant deduplication
- Migration 089: replies counting fix
- Migration 090: contributors sort order
- Migration 091: key metrics with 6 indicators
- UI: Compact heatmap (h-5)
- Docs: Attention zones diagnostic

Fixes: timeline, engagement, replies, sort order, new metrics block"

git push origin master
```

**Vercel deployment time:** ~2-3 minutes

---

## ✅ **Verification Checklist:**

### After Migrations Applied:

**Test in Supabase SQL Editor:**
```sql
-- 1. Check get_key_metrics exists
SELECT * FROM get_key_metrics(
  'YOUR_ORG_ID'::UUID, 
  14, 
  NULL
);
-- Should return 1 row with 12 columns

-- 2. Check get_top_contributors sort
SELECT rank, tg_user_id, activity_count 
FROM get_top_contributors(
  'YOUR_ORG_ID'::UUID, 
  10, 
  NULL
);
-- Should be sorted: rank 1, 2, 3...10
```

### After Frontend Deployed:

#### Dashboard (`/app/[org]/dashboard`):
- ✅ Activity Timeline: shows all 30 days (not zeros)
- ✅ Top Contributors: sorted 1→10
- ✅ Engagement Pie: correct count (3, not 13)
- ✅ **"Основные метрики"** block shows 6 metrics:
  1. Число участников
  2. Число сообщений
  3. Вовлечённость (%)
  4. Ответы
  5. Реакции
  6. Доля ответов (%)
- ✅ Heatmap: more compact

#### Group Analytics (`/app/[org]/telegram/groups/[id]/analytics`):
- ✅ Layout: 2×2 grid (compact)
- ✅ All components load without errors

#### Attention Zones:
- Run `db/diagnose_attention_zones.sql`
- Check if empty state is correct

---

## 📊 **Expected Results:**

### RPC Function Test Results:

**`get_key_metrics` should return:**
```json
{
  "current_participants": 3,
  "current_messages": 65,
  "current_engagement_rate": 100.0,
  "current_replies": 2,
  "current_reactions": 5,
  "current_reply_ratio": 3.1,
  "previous_participants": 2,
  "previous_messages": 45,
  "previous_engagement_rate": 66.7,
  "previous_replies": 1,
  "previous_reactions": 3,
  "previous_reply_ratio": 2.2
}
```

**`get_top_contributors` should return:**
```
rank | tg_user_id  | activity_count
-----|-------------|---------------
1    | 154588486   | 45
2    | 5484900079  | 32
3    | 108726833   | 18
```

---

## 🔧 **Rollback Plan (if needed):**

### If something breaks:

**Option 1: Revert specific migration**
```sql
-- Example: Rollback migration 091
DROP FUNCTION IF EXISTS get_key_metrics(UUID, INT, BIGINT);

-- Then restore old function from migration 089 or earlier
```

**Option 2: Revert frontend**
```bash
git revert HEAD
git push origin master
```

**Option 3: Emergency fix**
- Keep migrations (they're improvements)
- Fix only frontend UI issues via hotfix

---

## 📝 **Migration Order Summary:**

```
088 → 089 → 090 → 091
 ↓     ↓     ↓     ↓
org   replies sort  key
logic  fix    fix   metrics
```

**Dependencies:**
- 088: Independent (base fix)
- 089: Depends on 088 (uses org_telegram_groups pattern)
- 090: Depends on 088 (updates get_top_contributors)
- 091: Independent (new function)

**Safe to apply:** All migrations are additive (no data loss)

---

## 🎯 **Post-Deployment Actions:**

1. **Monitor Vercel logs** for errors (first 5 minutes)
2. **Test dashboard** with real org (your test org)
3. **Run diagnostic scripts:**
   - `db/diagnose_reactions.sql` (check reactions/replies)
   - `db/diagnose_attention_zones.sql` (check zones logic)
4. **Check performance:**
   - RPC functions response time (should be < 500ms)
   - Dashboard load time (should be < 2s)

---

## 📞 **If Issues Occur:**

### Common Issues & Fixes:

**Issue 1: "Function does not exist"**
- **Cause:** Migration not applied or wrong order
- **Fix:** Re-run migrations in order

**Issue 2: "Column does not exist"**
- **Cause:** Frontend deployed before migrations
- **Fix:** Apply migrations first, then redeploy frontend

**Issue 3: "RLS policy violation"**
- **Cause:** Missing GRANT EXECUTE
- **Fix:** Check migration has `GRANT EXECUTE ... TO authenticated`

**Issue 4: Component not rendering**
- **Cause:** Import missing or wrong path
- **Fix:** Check imports in page files

---

## ✅ **Final Checklist:**

Before marking as complete:

- [ ] All 4 migrations applied successfully
- [ ] Frontend deployed to Vercel
- [ ] Dashboard loads without errors
- [ ] Group analytics page loads without errors
- [ ] Key metrics show 6 indicators
- [ ] Top contributors sorted 1→10
- [ ] Diagnostic scripts run successfully
- [ ] No console errors in browser
- [ ] No errors in Vercel logs

---

**All ready!** 🎉 Proceed with deployment.

