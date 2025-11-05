# Day 1: Schema Extensions - Summary

**Date:** November 5, 2025  
**Status:** ✅ Ready to Apply  
**Time Required:** 1 hour

---

## 🎯 **What We're Doing Today:**

Adding **foundation schema** for:
1. **Organization goals** (retention, networking, events, etc.)
2. **Group keywords** (domain-specific terms for interest extraction)
3. **Participant enrichment structure** (via `custom_attributes` JSONB)
4. **Network analysis support** (`reply_to_user_id` in activity_events)

---

## 📦 **Files Created:**

### 1. **Migration 093** ✅
`db/migrations/093_add_goals_and_enrichment_schema.sql`

**What it does:**
- Adds `goals`, `focus_areas`, `timezone` to `organizations`
- Adds `group_goals`, `keywords`, `description` to `telegram_groups`
- Adds `reply_to_user_id` to `activity_events` (for network analysis)
- Creates helper functions:
  - `get_participant_enrichment(participant_id)` - Read enrichment data
  - `update_participant_enrichment(participant_id, data)` - Merge enrichment data
- Sets default goals for existing orgs

**Safety:** Uses `IF NOT EXISTS` - safe to run multiple times

---

### 2. **Revised Timeline** ✅
`docs/ANALYTICS_REVISED_TIMELINE.md`

**Updated priorities:**
1. ⭐️ **AI Weekly Digest** (Days 8-10) - Daily engagement!
2. ⭐️ **Enriched Profiles** (Days 11-13) - Foundation
3. **Churn Radar** (Days 15-16) - After feedback
4. **Network Map** (Days 17-18) - After feedback

---

### 3. **Step-by-Step Instructions** ✅
`docs/DAY_1_INSTRUCTIONS.md`

Detailed guide with:
- SQL queries to run
- Expected output
- Verification steps
- Troubleshooting

---

### 4. **Supporting Docs** ✅
- `docs/ANALYTICS_WOW_PRAGMATIC_PLAN.md` - Full implementation plan
- `docs/WHY_RULE_BASED_FIRST.md` - Rationale for rule-based approach
- `docs/ANALYTICS_DECISION_SUMMARY.md` - Decision summary

---

## ⚡️ **Next Steps (1 hour):**

### **1. Apply Migration (5 min)**
1. Open Supabase SQL Editor
2. Copy `db/migrations/093_add_goals_and_enrichment_schema.sql`
3. Paste and Run
4. Check for success message

### **2. Verify Schema (10 min)**
Run verification queries from `docs/DAY_1_INSTRUCTIONS.md`:
- Check new columns exist
- Check helper functions exist
- Test `get_participant_enrichment`
- Test `update_participant_enrichment`

### **3. Set Your Goals (5 min)**
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
WHERE id = '<YOUR_ORG_ID>';
```

### **4. Set Keywords for 1-2 Groups (10 min)**
```sql
UPDATE telegram_groups
SET 
  keywords = ARRAY['аналитика', 'метрики', 'дашборд'],
  description = 'Группа для обсуждения аналитики',
  group_goals = '{
    "purpose": "Networking & Support",
    "focus": ["Analytics", "Community Building"]
  }'::jsonb
WHERE tg_chat_id = <GROUP_CHAT_ID>;
```

### **5. Report Back**
Let me know:
- ✅ Migration applied?
- ✅ Any errors?
- ✅ Goals set?
- ✅ Keywords set?

---

## 📊 **Schema Overview:**

### **organizations table** (new columns)
```sql
goals JSONB                -- {"retention": 0.35, "networking": 0.25, ...}
focus_areas TEXT[]         -- ['Нетворкинг', 'Аналитика']
timezone TEXT              -- 'Europe/Moscow'
```

### **telegram_groups table** (new columns)
```sql
group_goals JSONB          -- {"purpose": "Networking", "focus": [...]}
keywords TEXT[]            -- ['аналитика', 'метрики', 'дашборд']
description TEXT           -- 'Группа для обсуждения аналитики'
```

### **participants table** (existing column, new structure)
```sql
custom_attributes JSONB    -- Flexible enrichment data:
{
  "interests_keywords": ["PPC", "рекрутинг"],
  "interests_weights": {"PPC": 0.45, "рекрутинг": 0.55},
  "city_inferred": "Москва",
  "city_confidence": 0.83,
  "behavioral_role": "helper",
  "role_confidence": 0.72,
  "communication_style": {
    "asks_questions": 0.3,
    "gives_answers": 0.7,
    "reply_rate": 0.65
  },
  "goals_self": "User-defined goals",
  "offers": ["What I can help with"],
  "asks": ["What I need help with"],
  "event_attendance": {
    "online_rate": 0.6,
    "offline_rate": 0.9
  }
}
```

### **activity_events table** (new column)
```sql
reply_to_user_id BIGINT    -- Telegram user ID being replied to (for network analysis)
```

---

## 🎯 **Success Criteria:**

After Day 1 completion:
- ✅ Migration 093 applied without errors
- ✅ Your organization has goals set (weights sum to 1.0)
- ✅ At least 1 group has keywords and description
- ✅ Helper functions tested and working
- ✅ Ready to start Day 3 (enrichment service)

---

## 🔮 **What Comes Next:**

### **Tomorrow (Day 2):**
- Monitor for any issues
- Adjust goals/keywords if needed
- Prepare for enrichment service development

### **Day 3-5:**
Build enrichment service:
- City detector (regex patterns)
- Interest extractor (TF-IDF + keywords)
- Role classifier (rule-based)
- Communication style analyzer

### **Day 6-7:**
Build enrichment pipeline:
- Manual enrichment API
- Batch enrichment cron
- Webhook integration

### **Day 8-10:**
AI Weekly Digest:
- RPC function for digest data
- Telegram template
- Daily cron job

---

## 📞 **Need Help?**

Refer to `docs/DAY_1_INSTRUCTIONS.md` for:
- Detailed SQL queries
- Expected outputs
- Troubleshooting
- Verification steps

---

## ✅ **Checklist:**

- [ ] Read `docs/DAY_1_INSTRUCTIONS.md`
- [ ] Open Supabase SQL Editor
- [ ] Apply migration 093
- [ ] Verify schema changes
- [ ] Test helper functions
- [ ] Set organization goals
- [ ] Set group keywords (1-2 groups)
- [ ] Report back with status

---

**Time Estimate:** 1 hour  
**Difficulty:** Low (mostly SQL)  
**Blockers:** None expected

---

**Status:** 🚀 Ready to Start  
**Next:** Apply migration, verify, report back

---

Good luck! 🎯

