# Analytics Fixes Summary - Day 3 (Final)

**Date:** November 5, 2025  
**Status:** ✅ Ready to Deploy

---

## 🐛 **Root Causes Identified:**

### Problem #1: Timeline RPC returns zeros
**Root Cause:** Group `-4987441578` was moved between 3 organizations:
- Events recorded with `org_id` from the org where group was at that moment
- RPC filtered `WHERE org_id = '4ea50899...'` → found only 9 newest events
- Missed 24 older events (recorded with different `org_id`)

**Result:** Timeline chart showed only recent data

### Problem #2: Engagement shows 13 participants instead of 3
**Root Cause:** System creates duplicate `participant_id` records:
- **Илья** (`tg_user_id: 108726833`) → 3 different `participant_id`
- **Тимофей** (`tg_user_id: 154588486`) → 6 different `participant_id`  
- **Тимур** (`tg_user_id: 5484900079`) → 4 different `participant_id`

**Why duplicates exist:**
1. Participant added to group multiple times (webhook events)
2. Import created new participant record even if one exists

**Result:** Engagement breakdown counts `participant_id` instead of unique users

---

## ✅ **Solution (Migration 088):**

### Strategy: **NO DATABASE STRUCTURE CHANGES**
- Keep `activity_events.org_id` (used for audit trail)
- Keep multiple `participant_id` per user (can coexist)
- Fix RPC functions logic instead

### Key Changes:

#### 1. Use `org_telegram_groups` instead of `activity_events.org_id`
```sql
-- OLD (wrong):
WHERE ae.org_id = p_org_id

-- NEW (correct):
WHERE ae.tg_chat_id IN (
  SELECT tg_chat_id FROM org_telegram_groups WHERE org_id = p_org_id
)
```

**Effect:** Find ALL events for groups currently in org (regardless of when/where event was recorded)

#### 2. Count unique `tg_user_id` instead of `participant_id`
```sql
-- OLD (wrong):
COUNT(DISTINCT pg.participant_id)

-- NEW (correct):
COUNT(DISTINCT p.tg_user_id)
```

**Effect:** Each real person counted once (handles duplicates automatically)

#### 3. Deduplicate in `get_top_contributors`
```sql
SELECT DISTINCT ON (c.tg_user_id)
  ...
ORDER BY c.tg_user_id, p.created_at ASC  -- Take earliest participant record
```

**Effect:** One row per person in leaderboard

---

## 📦 **Files Changed:**

### Backend (1 migration):
- `db/migrations/088_fix_analytics_org_id_logic.sql` - Recreate all 5 RPC functions with corrected logic

### Optional Cleanup (not required):
- `db/optional_cleanup_participant_duplicates.sql` - Script to merge duplicate `participant_id` (if you want to clean up DB later)

---

## 🚀 **Deployment:**

### Step 1: Apply Migration 088
```sql
-- In Supabase SQL Editor:
-- Copy/paste db/migrations/088_fix_analytics_org_id_logic.sql
-- Run it
```

### Step 2: Deploy Code (if needed)
```bash
git add .
git commit -m "fix: Analytics org_id logic + participant deduplication"
git push origin master
```

### Step 3: Verify
1. Open dashboard `/app/[org]/dashboard`
2. **Timeline** should show all dates (not just recent)
3. **Engagement** should show 3 participants (not 13)
4. **Лидеры** should show 3 unique users

---

## 🎯 **Expected Results:**

### Before (Broken):
- **Timeline:** 9 events found → mostly zeros
- **Engagement:** 13 participants (duplicates)
- **Лидеры:** Some users appeared multiple times

### After (Fixed):
- **Timeline:** 33 events found → correct distribution across dates
- **Engagement:** 3 participants (unique `tg_user_id`)
- **Лидеры:** 3 unique users (deduplicated)

---

## 🔧 **Optional: Clean up duplicates**

**When to do it:** Later (not urgent)  
**Why:** Migration 088 already handles duplicates correctly in analytics  
**How:** Run `db/optional_cleanup_participant_duplicates.sql` step-by-step

**Benefits of cleanup:**
- Cleaner database
- Faster queries (fewer joins)
- Prevents future duplicate creation

**Risks:**
- Requires careful testing
- Must check all places where `participant_id` is used

**Recommendation:** Run in TEST environment first, verify analytics still work, then apply to PROD

---

## 📋 **Technical Notes:**

### Why keep `activity_events.org_id`?
- Audit trail: shows which org "owned" the event when it happened
- Useful for debugging group migration issues
- Some code may rely on it (safer not to remove)

### Why keep duplicate `participant_id`?
- Safer to keep than to remove (complex foreign keys)
- Migration 088 handles them transparently
- Can clean up later when confident

### Why this approach is safe?
- **No schema changes** → no risk of breaking existing code
- **Logic changes only in RPC** → isolated impact
- **Backward compatible** → old data still works

---

## ✅ **Checklist:**

- [x] Identified root causes (org_id filter + participant duplicates)
- [x] Created migration 088 with fixed logic
- [x] Tested approach with diagnostic queries
- [x] Created optional cleanup script
- [ ] Apply migration 088
- [ ] Verify analytics work correctly
- [ ] (Optional) Clean up participant duplicates later

---

**Ready to deploy!** 🎯

