# Analytics Wow-Effect: Revised Timeline

**Date:** November 5, 2025  
**Status:** Day 1 Started ✅  
**Updated Priority:** Digest → Profiles → Churn/Network (after feedback)

---

## 🎯 **Priority Changes:**

### ✅ **User Decision:**
1. **AI Weekly Digest** (first) - Daily engagement priority!
2. **Enriched Profiles** (second) - Foundation for everything
3. **Churn Radar** (later) - After customer feedback
4. **Network Map** (later) - After customer feedback

**Rationale:** Get daily engagement + profile foundation first, then iterate based on real usage.

---

## 📅 **Revised Timeline (16 days)**

### **Week 1: Foundation (Days 1-7)**

#### **Day 1-2: Schema Extensions** ✅ Started
**Goal:** Add goals, keywords, enrichment fields

**What:**
- ✅ Migration 093 created
- Organizations: `goals`, `focus_areas`, `timezone`
- Telegram Groups: `group_goals`, `keywords`, `description`
- Participants: `custom_attributes` (enrichment structure documented)
- Activity Events: `reply_to_user_id` (for network analysis)

**Files:**
- ✅ `db/migrations/093_add_goals_and_enrichment_schema.sql`

**Next Steps (Day 1-2):**
1. Apply migration 093 to Supabase
2. Verify schema changes
3. Test helper functions (`get_participant_enrichment`, `update_participant_enrichment`)
4. Create test data (set goals for 1 org, keywords for 1 group)

**Effort:** 2-3 hours ✅

---

#### **Day 3-5: Enrichment Service**
**Goal:** Rule-based participant enrichment

**What to Build:**
1. **City Detection** (`lib/services/enrichment/cityDetector.ts`)
   - Regex patterns for top 50 Russian cities
   - Confidence scoring based on mention frequency
   - Decay factor for old messages

2. **Interest Extraction** (`lib/services/enrichment/interestExtractor.ts`)
   - TF-IDF on participant's messages
   - Boost group keywords
   - Return top 10-15 with weights

3. **Behavioral Role Classifier** (`lib/services/enrichment/roleClassifier.ts`)
   - Rules based on reply_rate, received_rate, unique_contacts
   - Roles: helper, bridge, observer, broadcaster
   - Confidence scores

4. **Communication Style Analyzer** (`lib/services/enrichment/styleAnalyzer.ts`)
   - % questions vs answers
   - Reply rate
   - Average response time

5. **Main Service** (`lib/services/participantEnrichmentService.ts`)
   - Orchestrates all enrichment modules
   - Applies decay to old data
   - Updates `custom_attributes` via RPC

**Effort:** 2-3 days

---

#### **Day 6-7: Enrichment Pipeline**
**Goal:** Automated and manual enrichment

**What to Build:**
1. **API Endpoint: Manual Enrichment**
   - `app/api/participants/[id]/enrich/route.ts`
   - Fetch last 90 days messages
   - Run enrichment
   - Return enriched profile

2. **Cron: Batch Enrichment**
   - `app/api/cron/enrich-participants/route.ts`
   - Runs nightly
   - Enriches N participants per org (priority: active, not enriched in 30 days)

3. **Webhook Integration**
   - In `eventProcessingService.ts`
   - After processing message, check if should enrich
   - Enrich in background (don't block webhook)

**Effort:** 1-2 days

---

### **Week 2: Wow Modules (Days 8-14)**

#### **Day 8-10: AI Weekly Digest** ⭐️ (NEW PRIORITY #1)
**Goal:** Telegram DM at 9 AM with insights + actions

**What to Build:**

1. **RPC Function: Weekly Digest Data**
   - `db/migrations/094_weekly_digest_function.sql`
   - `get_weekly_digest(org_id, tg_chat_id)` - returns structured JSON:
     ```json
     {
       "activity_pulse": {
         "current_messages": 145,
         "previous_messages": 120,
         "change_pct": 20.8,
         "trend": "up"
       },
       "top_contributors": [
         {"name": "Иван", "messages": 25, "reactions": 15, "rank_change": 1}
       ],
       "new_members": [
         {"name": "Мария", "joined_at": "2025-11-01", "first_message": true}
       ],
       "attention_zones": [
         {"type": "churn_risk", "count": 3, "message": "3 участника молчат 14+ дней"}
       ],
       "suggested_actions": [
         {"action": "introduce", "params": {"user_a": 123, "user_b": 456}, "reason": "Похожие интересы"},
         {"action": "invite_event", "params": {"user_id": 789}, "reason": "Не был на последних 3 событиях"}
       ]
     }
     ```

2. **Digest Template**
   - `lib/templates/weeklyDigest.ts`
   - Russian text with emojis
   - 5 sections: Pulse, Contributors, New Members, Attention, Actions
   - Telegram markdown formatting

3. **Cron Job**
   - `app/api/cron/send-weekly-digests/route.ts`
   - Runs daily at 9 AM (per org timezone)
   - Fetches digest data via RPC
   - Sends via Telegram notifications bot
   - Logs delivery status

4. **Telegram Notifications Bot Integration**
   - Ensure bot can send DMs to org owners/admins
   - Handle permissions (user must have started bot)

**Files:**
- `db/migrations/094_weekly_digest_function.sql`
- `lib/templates/weeklyDigest.ts`
- `app/api/cron/send-weekly-digests/route.ts`
- `lib/services/telegramNotificationService.ts` (if not exists)

**Effort:** 2-3 days

---

#### **Day 11-13: Enriched Participant Profiles UI** ⭐️ (NEW PRIORITY #2)
**Goal:** Show auto-extracted data + allow editing

**What to Build:**

1. **Enhanced Profile Page**
   - `app/app/[org]/members/[id]/page.tsx`
   - Display enrichment data from `custom_attributes`:
     - Interests (keywords with weights) - visual tags
     - City (with confidence badge)
     - Behavioral Role (badge: Helper/Bridge/Observer/Broadcaster)
     - Communication Style (% questions, % answers, reply rate)
     - Event Attendance (online/offline rates, no-show rate)

2. **Editable Goals/Offers/Asks**
   - `components/members/enriched-profile-form.tsx`
   - Form fields for:
     - `goals_self` (text area)
     - `offers` (tag input)
     - `asks` (tag input)
     - `city_confirmed` (dropdown or text)
   - Save to `custom_attributes` via API

3. **Similar Participants API**
   - `app/api/participants/[id]/similar/route.ts`
   - Cosine similarity on `interests_keywords`
   - Return top 5 similar participants
   - Show on profile page

4. **Manual Enrichment Button**
   - "Обновить профиль" button
   - Calls `/api/participants/[id]/enrich`
   - Shows loading + success/error

5. **Visual Components**
   - `components/members/interest-cloud.tsx` - Word cloud of interests
   - `components/members/role-badge.tsx` - Badge for behavioral role
   - `components/members/city-badge.tsx` - City with confidence indicator
   - `components/members/communication-stats.tsx` - Pie/bar charts

**Files:**
- `app/app/[org]/members/[id]/page.tsx` (update)
- `components/members/enriched-profile-form.tsx`
- `components/members/interest-cloud.tsx`
- `components/members/role-badge.tsx`
- `components/members/city-badge.tsx`
- `components/members/communication-stats.tsx`
- `app/api/participants/[id]/similar/route.ts`

**Effort:** 2-3 days

---

#### **Day 14: Testing + Feedback Collection**
**Goal:** Ensure Digest + Profiles work, collect user feedback

**What to Do:**
1. Test Weekly Digest on real org (yours)
2. Verify digest content accuracy
3. Test Profile enrichment on 5-10 participants
4. Check UI/UX on mobile + desktop
5. Collect feedback (CustDev interviews)
6. Document issues/improvements

**Deliverables:**
- ✅ Digest sent successfully
- ✅ Profiles enriched correctly
- 📝 Feedback doc (what works, what doesn't)
- 📝 Next iteration priorities

**Effort:** 1 day

---

### **Week 3: Feedback-Driven Modules (Days 15-18)**

#### **Day 15-16: Churn Risk Radar** (After Feedback)
**Goal:** Visual widget showing at-risk participants

**What to Build:**
1. **Enhanced RPC Function**
   - Update `get_attention_zones` or create `get_churn_risks`
   - Return participants with `risk_score > 0.6`
   - Include **reasons** (rule-based):
     - "Молчит 14+ дней"
     - "Активность упала на 60%"
     - "Не отвечает другим"
     - "Пропустил последние 3 события"

2. **UI Widget**
   - `components/analytics/churn-risk-radar.tsx`
   - Table or card list
   - Show: name, risk_score, reasons, last_activity
   - Actions:
     - "Написать сообщение"
     - "Пригласить на событие"
     - "Познакомить с участником"

3. **Integration**
   - Add to main Dashboard (`app/app/[org]/dashboard/page.tsx`)
   - Add to group analytics pages

**Effort:** 1-2 days

---

#### **Day 17-18: Network Map & Bridge Finder** (After Feedback)
**Goal:** Visual network graph

**What to Build:**
1. **RPC Function: Network Graph**
   - `db/migrations/095_network_graph_function.sql`
   - `get_network_graph(org_id, tg_chat_id)`
   - Query `activity_events` where `reply_to_user_id IS NOT NULL`
   - Build edge list: `{from: user_id, to: user_id, weight: count}`
   - Calculate degree centrality (simple: count of connections)
   - Identify:
     - **Bridges:** High betweenness (connect different groups)
     - **Core:** High degree (many connections)
     - **Isolates:** Zero connections

2. **UI Component**
   - `components/analytics/network-map.tsx`
   - Use React-Flow or Cytoscape.js
   - Nodes: participants (sized by degree)
   - Edges: replies (thicker = more replies)
   - Highlight bridges, isolates

3. **Actions**
   - Click node → show participant profile
   - "Познакомить X с Y" button
   - "Назначить Z модератором" (if bridge)

**Effort:** 1-2 days

---

## 📊 **Progress Tracking**

### **Week 1 Checklist:**
- [x] Day 1: Migration 093 created
- [ ] Day 1-2: Migration applied, tested
- [ ] Day 3: City detector built
- [ ] Day 4: Interest extractor + role classifier built
- [ ] Day 5: Style analyzer + main service built
- [ ] Day 6: Manual enrichment API
- [ ] Day 7: Batch enrichment cron + webhook integration

### **Week 2 Checklist:**
- [ ] Day 8: Weekly digest RPC function
- [ ] Day 9: Digest template + Telegram integration
- [ ] Day 10: Digest cron + testing
- [ ] Day 11: Profile UI enhancement
- [ ] Day 12: Editable goals/offers/asks
- [ ] Day 13: Similar participants + visual components
- [ ] Day 14: Testing + feedback collection

### **Week 3 Checklist:**
- [ ] Day 15: Churn Radar RPC
- [ ] Day 16: Churn Radar UI + integration
- [ ] Day 17: Network Map RPC
- [ ] Day 18: Network Map UI + actions

---

## 🎯 **Success Metrics**

### **End of Week 1:**
- ✅ All participants have enrichment data in `custom_attributes`
- ✅ City detected for 70%+ participants
- ✅ Interests extracted for 80%+ participants
- ✅ Roles assigned to 90%+ participants

### **End of Week 2:**
- ✅ Weekly Digest sent to all org admins
- ✅ Digest open rate > 50%
- ✅ Profile pages show enrichment data
- ✅ At least 1 admin edits goals/offers/asks
- ✅ Positive feedback from 2+ CustDev interviews

### **End of Week 3:**
- ✅ Churn Radar identifies 5+ at-risk participants
- ✅ Network Map visualizes connections
- ✅ At least 1 admin uses "introduce" action
- ✅ Zero critical bugs

---

## ⚡️ **Immediate Next Steps (Day 1-2):**

1. **Apply Migration 093** (5 minutes)
   ```bash
   # In Supabase SQL Editor
   # Copy/paste db/migrations/093_add_goals_and_enrichment_schema.sql
   # Execute
   ```

2. **Verify Schema** (10 minutes)
   ```sql
   -- Check organizations
   SELECT id, name, goals, focus_areas, timezone
   FROM organizations LIMIT 3;
   
   -- Check telegram_groups
   SELECT id, title, group_goals, keywords, description
   FROM telegram_groups LIMIT 3;
   
   -- Check participants
   SELECT id, full_name, custom_attributes
   FROM participants LIMIT 3;
   ```

3. **Test Helper Functions** (15 minutes)
   ```sql
   -- Test get_participant_enrichment
   SELECT get_participant_enrichment('<some_participant_id>');
   
   -- Test update_participant_enrichment
   SELECT update_participant_enrichment(
     '<some_participant_id>',
     '{"test_field": "test_value"}'::jsonb
   );
   
   -- Verify update
   SELECT custom_attributes FROM participants WHERE id = '<some_participant_id>';
   ```

4. **Set Goals for Your Org** (10 minutes)
   ```sql
   UPDATE organizations
   SET 
     goals = '{
       "retention": 0.40,
       "networking": 0.30,
       "events_attendance": 0.20,
       "content_quality": 0.10
     }'::jsonb,
     focus_areas = ARRAY['Аналитика', 'Нетворкинг', 'Мероприятия']
   WHERE id = '<your_org_id>';
   ```

5. **Set Keywords for 1 Test Group** (10 minutes)
   ```sql
   UPDATE telegram_groups
   SET 
     keywords = ARRAY['аналитика', 'метрики', 'дашборд', 'отчёты'],
     description = 'Группа для обсуждения аналитики и метрик сообщества',
     group_goals = '{
       "purpose": "Networking & Support",
       "focus": ["Analytics", "Community Building"],
       "tone": "professional"
     }'::jsonb
   WHERE id = <test_group_id>;
   ```

**Total Time (Day 1-2):** 50 minutes ✅

---

## 📞 **Questions / Blockers?**

If anything blocks progress:
1. Migration errors → Check logs, fix syntax
2. RPC permission issues → Check `GRANT EXECUTE` statements
3. Schema conflicts → Drop/recreate if needed (dev only!)

---

**Status:** 🚀 **Day 1 In Progress**  
**Next:** Apply migration 093, verify, set test data  
**ETA:** 1 hour

