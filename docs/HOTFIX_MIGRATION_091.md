# Hotfix: Migration 091 & Import Fix

**Date:** November 5, 2025  
**Status:** ✅ Fixed

---

## 🐛 **Issues:**

### 1. Migration 091 Error
**Error Message:**
```
ERROR: 42P13: cannot change return type of existing function
DETAIL: Row type defined by OUT parameters is different.
HINT: Use DROP FUNCTION get_key_metrics(uuid,integer,bigint) first.
```

**Cause:** 
- Function signature changed (added `current_reply_ratio` and `previous_reply_ratio`)
- PostgreSQL requires explicit DROP before recreating with different return type

**Fix:**
Added `DROP FUNCTION IF EXISTS get_key_metrics(UUID, INT, BIGINT);` at the beginning of migration 091.

**File:** `db/migrations/091_key_metrics_function.sql` (line 6)

---

### 2. TypeScript Compilation Error
**Error Message:**
```
Cannot find name 'KeyMetrics'.
```

**Location:** `app/app/[org]/telegram/groups/[id]/page.tsx` (line 645)

**Cause:**
- Component was using `KeyMetrics` but import was missing
- Still had old import `ReactionsRepliesStats`

**Fix:**
Changed import from `ReactionsRepliesStats` to `KeyMetrics`.

**File:** `app/app/[org]/telegram/groups/[id]/page.tsx` (line 15)

---

## ✅ **Changes Made:**

### 1. Migration 091 Updated
```sql
-- ADDED:
DROP FUNCTION IF EXISTS get_key_metrics(UUID, INT, BIGINT);

-- THEN:
CREATE OR REPLACE FUNCTION get_key_metrics(...)
```

**Result:** Migration is now **idempotent** (safe to re-run)

### 2. Import Fixed
```typescript
// BEFORE:
import ReactionsRepliesStats from '@/components/analytics/reactions-replies-stats'

// AFTER:
import KeyMetrics from '@/components/analytics/key-metrics'
```

**Result:** Compilation succeeds ✅

---

## 🚀 **Deployment:**

### Step 1: Re-run Migration 091
```sql
-- In Supabase SQL Editor:
-- Copy/paste: db/migrations/091_key_metrics_function.sql
-- Run it (now works correctly)
```

**Expected Output:**
```
Migration 091 Complete: Key metrics function created
```

### Step 2: Deploy Frontend
```bash
git add .
git commit -m "hotfix: Migration 091 DROP FUNCTION + KeyMetrics import fix"
git push origin master
```

**Expected Result:**
- ✅ Vercel build succeeds
- ✅ No TypeScript errors
- ✅ Dashboard loads correctly

---

## ✅ **Verification:**

### Test Migration 091:
```sql
-- Should return 1 row with 12 columns
SELECT * FROM get_key_metrics(
  'YOUR_ORG_ID'::UUID,
  14,
  NULL
);
```

**Expected columns:**
1. `current_participants`
2. `current_messages`
3. `current_engagement_rate`
4. `current_replies`
5. `current_reactions`
6. `current_reply_ratio` ← NEW
7. `previous_participants`
8. `previous_messages`
9. `previous_engagement_rate`
10. `previous_replies`
11. `previous_reactions`
12. `previous_reply_ratio` ← NEW

### Test Frontend:
- Open `/app/[org]/dashboard`
- Check "Основные метрики" block shows 6 metrics
- Open `/app/[org]/telegram/groups/[id]`
- Check Analytics tab loads without errors

---

## 📋 **Root Cause Analysis:**

### Why Migration Failed?

PostgreSQL is strict about function return types:
- `CREATE OR REPLACE` can change function **body**
- `CREATE OR REPLACE` **cannot** change return type
- Must use `DROP FUNCTION` first

**Lesson:** Always include `DROP FUNCTION IF EXISTS` when changing function signature.

### Why Import Was Missing?

- Multiple files needed updates:
  - ✅ `dashboard/page.tsx` - fixed
  - ✅ `groups/[id]/analytics/page.tsx` - fixed
  - ❌ `groups/[id]/page.tsx` - **was missed**

**Lesson:** Check all 3 analytics pages when replacing components.

---

## ✅ **Files Modified:**

1. **db/migrations/091_key_metrics_function.sql**
   - Added: `DROP FUNCTION IF EXISTS` (line 6)

2. **app/app/[org]/telegram/groups/[id]/page.tsx**
   - Changed: Import from `ReactionsRepliesStats` to `KeyMetrics` (line 15)

3. **docs/DEPLOY_CHECKLIST_DAY3.md**
   - Updated: Added note about idempotency

4. **docs/HOTFIX_MIGRATION_091.md**
   - Created: This document

---

## 🎯 **Status:**

- [x] Migration 091 fixed (idempotent)
- [x] Import added to all 3 pages
- [x] Compilation succeeds
- [x] Documentation updated
- [ ] **Apply migration 091** (in Supabase)
- [ ] **Deploy frontend** (to Vercel)

---

**Ready to deploy!** 🚀

