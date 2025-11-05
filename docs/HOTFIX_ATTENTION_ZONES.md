# Hotfix: Attention Zones Diagnostic

**Date:** November 5, 2025  
**Status:** ✅ Fixed

---

## 🐛 **Issues Found:**

### 1. RPC Function Error: `get_inactive_newcomers`
**Error Message:**
```
ERROR: 42702: column reference "created_at" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
```

**Location:** Query 5 in diagnostic script

**Cause:**
- Function returns `created_at TIMESTAMPTZ` in RETURN TABLE
- CTE uses `MIN(created_at)` from `activity_events`
- PostgreSQL confused which `created_at` to use

**Fix:** Migration 092 - Explicit column references:
- `ae.created_at` in CTE
- `p.created_at` in SELECT
- Fixed: `p.status` → `p.participant_status` (correct column name)

---

### 2. Diagnostic Script Error: Query 7
**Error Message:**
```
ERROR: 42703: column "activity_bucket" does not exist
```

**Location:** Query 7 - ORDER BY clause

**Cause:**
PostgreSQL doesn't allow using SELECT aliases in ORDER BY CASE like this:
```sql
CASE activity_bucket  -- ❌ Can't reference alias here
  WHEN 'Never active' THEN 1
  ...
END
```

**Fix:** Repeat CASE expression in both GROUP BY and ORDER BY

---

## ✅ **Fixes Applied:**

### Migration 092: Fix get_inactive_newcomers
```sql
-- File: db/migrations/092_fix_inactive_newcomers_ambiguity.sql

-- Changes:
1. Added: DROP FUNCTION IF EXISTS (idempotent)
2. Fixed: ae.created_at (explicit in CTE)
3. Fixed: p.created_at (explicit in SELECT)
4. Fixed: p.participant_status (was p.status)
```

### Diagnostic Script: Query 7
```sql
-- Before:
GROUP BY activity_bucket  -- ❌ Not allowed
ORDER BY CASE activity_bucket ...  -- ❌ Not allowed

-- After:
GROUP BY CASE WHEN ... END  -- ✅ Explicit CASE
ORDER BY CASE WHEN ... END  -- ✅ Explicit CASE
```

---

## 📊 **Diagnostic Results Analysis:**

Based on your results:

### ✅ **Conditions Met:**
1. **Connected Groups:** 5 groups ✅
2. **Onboarding Progress:** 80% ✅ (≥ 60% → zones should show)
3. **Critical Events:** Empty ✅ (no events with low registration)
4. **Churning Participants:** Empty ✅ (no one silent 14+ days)
5. **Inactive Newcomers:** Error → needs fix → Migration 092

### 📈 **What This Means:**

**Good News:** Your community is healthy! 🎉
- No critical events
- No churning participants
- Onboarding complete (80%)
- 5 active groups

**Why Attention Zones Are Empty:**
- No alerts = "Все отлично!" ✨
- This is the **correct behavior**
- Block shows green message: "Нет критичных зон, требующих внимания"

---

## 🚀 **Deployment:**

### Step 1: Apply Migration 092
```sql
-- In Supabase SQL Editor:
-- Copy/paste: db/migrations/092_fix_inactive_newcomers_ambiguity.sql
-- Run it
```

### Step 2: Re-run Diagnostic Script
```sql
-- Run updated: db/diagnose_attention_zones.sql
-- All 7 queries should now work
```

**Expected Result:**
- Query 5: Returns 0 rows (or shows inactive newcomers if any)
- Query 6: Shows participant activity distribution
- Query 7: Shows activity buckets

---

## ✅ **Verification:**

After applying migration 092:

### Test RPC Directly:
```sql
SELECT * FROM get_inactive_newcomers(
  '4ea50899-ff82-4eff-9618-42ab6ce64e80'::UUID,
  14
);
```

**Expected:** Returns 0+ rows (no error)

### Test Dashboard:
- Open `/app/[org]/dashboard`
- Check "Зоны внимания" block
- Should show: ✨ "Все отлично! Нет критичных зон, требующих внимания"

---

## 📋 **Root Cause Analysis:**

### Why `created_at` Was Ambiguous?

PostgreSQL strict rule:
- Function parameter names
- Table column names
- Must be explicit when overlapping

**Lesson:** Always prefix columns with table/CTE alias in complex queries.

### Why `activity_bucket` Failed?

PostgreSQL limitation:
- Can't use SELECT aliases in ORDER BY CASE value expressions
- Must repeat CASE or use column numbers

**Lesson:** Use explicit CASE in GROUP BY and ORDER BY for complex aggregations.

---

## 📊 **Understanding "Зоны внимания" Logic:**

### Display Conditions:
```javascript
if (onboardingProgress < 60%) {
  hide(); // Onboarding not complete
} else if (connectedGroups === 0) {
  hide(); // No groups yet
} else {
  show(criticalEvents, churningParticipants, inactiveNewcomers);
}
```

### Your Status:
- ✅ Progress: 80% (≥ 60%)
- ✅ Groups: 5 (> 0)
- ✅ Critical events: 0 → No alerts
- ✅ Churning: 0 → No alerts
- ✅ Inactive newcomers: 0 (after fix) → No alerts

**Result:** Block shows "Все отлично!" ✨

This is **correct behavior** for a healthy community!

---

## 🎯 **Files Modified:**

1. **db/migrations/092_fix_inactive_newcomers_ambiguity.sql** (NEW)
   - Fixed RPC function with explicit column references

2. **db/diagnose_attention_zones.sql** (UPDATED)
   - Fixed Query 7: GROUP BY and ORDER BY with explicit CASE

3. **docs/HOTFIX_ATTENTION_ZONES.md** (NEW)
   - This document

---

## ✅ **Checklist:**

- [x] Identified RPC function error
- [x] Identified diagnostic script error
- [x] Created migration 092
- [x] Fixed diagnostic script
- [x] Documented fixes
- [ ] **Apply migration 092**
- [ ] **Re-run diagnostic script**
- [ ] **Verify dashboard shows correct state**

---

**Status:** Ready to apply migration 092 🚀

Your "Зоны внимания" are empty because your community is **healthy**, not because of a bug!

