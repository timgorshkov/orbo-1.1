# Day 1: Apply Migration 093 - Instructions

**Date:** November 5, 2025  
**Time Required:** 1 hour  
**Goal:** Add schema for goals and participant enrichment

---

## ✅ **Step-by-Step Instructions**

### **Step 1: Apply Migration (5 min)**

1. Open **Supabase SQL Editor**: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Copy entire contents of `db/migrations/093_add_goals_and_enrichment_schema.sql`
3. Paste into SQL Editor
4. Click "Run" (or Ctrl+Enter)
5. Wait for success message

**Expected Output:**
```
NOTICE:  Migration 093 Complete:
NOTICE:    - Organizations with goals: 1
NOTICE:    - Telegram groups ready for enrichment: 5
NOTICE:    - Participants ready for enrichment: 13
```

---

### **Step 2: Verify Schema Changes (5 min)**

Run these queries to confirm schema is correct:

```sql
-- 1. Check organizations table
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name = 'organizations' 
  AND column_name IN ('goals', 'focus_areas', 'timezone')
ORDER BY column_name;

-- Expected: 3 rows (goals JSONB, focus_areas TEXT[], timezone TEXT)

-- 2. Check telegram_groups table
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'telegram_groups' 
  AND column_name IN ('group_goals', 'keywords', 'description')
ORDER BY column_name;

-- Expected: 3 rows

-- 3. Check activity_events table
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_name = 'activity_events' 
  AND column_name = 'reply_to_user_id';

-- Expected: 1 row (reply_to_user_id BIGINT)

-- 4. Check helper functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_participant_enrichment', 'update_participant_enrichment')
ORDER BY routine_name;

-- Expected: 2 rows
```

---

### **Step 3: Check Default Goals (2 min)**

Verify your organization has default goals:

```sql
SELECT 
  id,
  name,
  goals,
  focus_areas,
  timezone
FROM organizations
WHERE id = '4ea50899-ff82-4eff-9618-42ab6ce64e80';
```

**Expected Output:**
```json
{
  "retention": 0.35,
  "networking": 0.25,
  "events_attendance": 0.20,
  "content_quality": 0.10,
  "monetization": 0.10
}
```

---

### **Step 4: Test Helper Functions (10 min)**

#### 4.1 Test Read Function

```sql
-- Pick a participant ID from your org
SELECT id, full_name FROM participants LIMIT 5;

-- Test get_participant_enrichment (should return {} for now)
SELECT get_participant_enrichment('b6a5e262-b516-4e41-acc9-5cfc65cf2fe4');
```

**Expected:** `{}`

#### 4.2 Test Update Function

```sql
-- Add test enrichment data
SELECT update_participant_enrichment(
  'b6a5e262-b516-4e41-acc9-5cfc65cf2fe4',
  '{
    "test_field": "test_value",
    "interests_keywords": ["тест", "аналитика"]
  }'::jsonb
);

-- Verify it was saved
SELECT custom_attributes 
FROM participants 
WHERE id = 'b6a5e262-b516-4e41-acc9-5cfc65cf2fe4';
```

**Expected:**
```json
{
  "test_field": "test_value",
  "interests_keywords": ["тест", "аналитика"]
}
```

#### 4.3 Test Merge Behavior

```sql
-- Add more fields (should merge, not replace)
SELECT update_participant_enrichment(
  'b6a5e262-b516-4e41-acc9-5cfc65cf2fe4',
  '{"city_inferred": "Москва", "city_confidence": 0.85}'::jsonb
);

-- Verify merge (should have both test_field AND city_inferred)
SELECT custom_attributes 
FROM participants 
WHERE id = 'b6a5e262-b516-4e41-acc9-5cfc65cf2fe4';
```

**Expected:**
```json
{
  "test_field": "test_value",
  "interests_keywords": ["тест", "аналитика"],
  "city_inferred": "Москва",
  "city_confidence": 0.85
}
```

✅ If this works, merge is correct!

---

### **Step 5: Set Goals for Your Organization (5 min)**

Customize goals based on your priorities:

```sql
UPDATE organizations
SET 
  goals = '{
    "retention": 0.40,
    "networking": 0.30,
    "events_attendance": 0.20,
    "content_quality": 0.10
  }'::jsonb,
  focus_areas = ARRAY['Аналитика', 'Нетворкинг', 'Мероприятия'],
  timezone = 'Europe/Moscow'
WHERE id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';

-- Verify
SELECT name, goals, focus_areas, timezone
FROM organizations
WHERE id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1';
```

**Tips:**
- Weights should sum to 1.0
- Pick 2-4 focus areas (what matters most)
- Set correct timezone (affects digest delivery)

---

### **Step 6: Set Keywords for 1-2 Test Groups (10 min)**

Pick your most active groups and add context:

```sql
-- See your groups
SELECT id, title, tg_chat_id
FROM telegram_groups
ORDER BY member_count DESC
LIMIT 5;

-- Set keywords for Group 1
UPDATE telegram_groups
SET 
  keywords = ARRAY['аналитика', 'метрики', 'дашборд', 'отчёты', 'данные'],
  description = 'Группа для обсуждения аналитики и метрик сообщества',
  group_goals = '{
    "purpose": "Networking & Support",
    "focus": ["Analytics", "Community Building"],
    "tone": "professional"
  }'::jsonb
WHERE tg_chat_id = '-4987441578';

-- Set keywords for Group 2 (if different focus)
UPDATE telegram_groups
SET 
  keywords = ARRAY['мероприятия', 'встречи', 'оффлайн', 'нетворкинг'],
  description = 'Организация оффлайн мероприятий и встреч',
  group_goals = '{
    "purpose": "Events & Networking",
    "focus": ["Offline Events", "Networking"],
    "tone": "casual"
  }'::jsonb
WHERE tg_chat_id = '-1002994446785';

-- Verify
SELECT title, keywords, description, group_goals
FROM telegram_groups
WHERE keywords IS NOT NULL AND keywords != '{}';
```

**Tips:**
- Keywords: 5-10 main topics for this group
- Description: Human-readable (shown to participants later)
- Purpose: What is this group for?
- Focus: 2-4 main themes
- Tone: professional | casual | technical

---

### **Step 7: Clean Up Test Data (Optional, 2 min)**

If you added test enrichment, clean it:

```sql
-- Remove test fields
UPDATE participants
SET custom_attributes = custom_attributes - 'test_field'
WHERE custom_attributes ? 'test_field';

-- Verify clean
SELECT id, full_name, custom_attributes
FROM participants
WHERE custom_attributes != '{}'::jsonb;
```

---

## ✅ **Verification Checklist**

- [ ] Migration 093 applied successfully
- [ ] Organizations table has `goals`, `focus_areas`, `timezone` columns
- [ ] Telegram groups table has `group_goals`, `keywords`, `description` columns
- [ ] Activity events table has `reply_to_user_id` column
- [ ] Helper functions `get_participant_enrichment` and `update_participant_enrichment` exist
- [ ] Your organization has goals set (weights sum to 1.0)
- [ ] At least 1 group has keywords and description set
- [ ] Test enrichment data saved and merged correctly

---

## 🚨 **Troubleshooting**

### Error: "column already exists"
**Solution:** Some columns might already exist. This is OK, migration has `IF NOT EXISTS` checks.

### Error: "permission denied"
**Solution:** Make sure you're using the Supabase service role key, or run as admin.

### Error: "function does not exist"
**Solution:** Check if `GRANT EXECUTE` statements ran. Re-run migration if needed.

### Goals not showing after UPDATE
**Solution:** Check your `WHERE id = ...` clause. Verify org ID is correct.

---

## 🎯 **What's Next?**

After completing Day 1:

1. **Tomorrow (Day 2):** Verify everything works in production
2. **Day 3-5:** Build enrichment service (city detector, interest extractor, role classifier)
3. **Day 6-7:** Build enrichment pipeline (API, cron, webhook)

---

## 📞 **Report Back**

After completing these steps, let me know:
1. ✅ Migration applied successfully? (any errors?)
2. ✅ Goals set for your org? (share values if you want feedback)
3. ✅ Keywords set for 1-2 groups? (share if you want feedback)
4. 🚨 Any issues or questions?

---

**Status:** 🎯 Ready for Day 1 execution  
**Time:** ~1 hour  
**Next:** Apply migration, verify, report back

