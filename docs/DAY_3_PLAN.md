# 📋 Plan for Day 3 — Nov 5, 2025

**Status:** Wave 0.1 Complete ✅ → Starting Wave 0.2 (Analytics Wow-Effect)

---

## 🎯 High-Level Goals

### Primary Goal: Deploy & Start Group Analytics Dashboard
**Why:** Wave 0.2 критична для "wow-effect" у первых пользователей

### Secondary Goal: Stability Check
**Why:** После 2 дней активной работы нужно убедиться, что всё работает

---

## 📊 Morning Session (1-1.5 hours)

### 1. Deploy & Stability Check ⚡

**Tasks:**
- [ ] Deploy final changes to Vercel
  - Migration 082 (fix `check_participant_exclusion` trigger)
  - Updated `parse/route.ts` (improved bot filtering)
- [ ] Apply migration 082 in Supabase SQL Editor
- [ ] Run cleanup script for ChatKeeperBot (optional)
- [ ] Smoke test:
  - Send webhook message → check `participant_messages` saved
  - Import JSON file → check texts saved
  - Check "Доступные группы" page loads
  - Check superadmin panel (groups, users)

**Success criteria:**
- ✅ No errors in Vercel logs for 30 minutes after deploy
- ✅ Webhook health status shows "Healthy"
- ✅ Import works without errors

**Estimated time:** 30-45 min

---

## 🚀 Main Session (2-2.5 hours)

### 2. Wave 0.2 Block 1: Group Analytics Dashboard (Start) 📊

**Context:** From roadmap — 8 story points (16-24 hours total)  
**Today's scope:** MVP version (4-6 hours work)

#### Feature Breakdown:

**2.1. Backend: Analytics RPC Functions (1.5-2 hours)**
- [ ] Create `get_group_activity_timeline(org_id, tg_chat_id, days)` RPC
  - Returns: `{ date, message_count, active_users, reactions_count }`
  - Query from `activity_events` grouped by date
- [ ] Create `get_top_contributors(org_id, tg_chat_id, limit)` RPC
  - Returns: `{ participant_id, full_name, message_count, last_active }`
  - Join `activity_events` + `participants`
- [ ] Create `get_silent_members(org_id, tg_chat_id, days_threshold)` RPC
  - Returns participants with no activity for N days
  - Filter by `last_activity_at`

**Files to create:**
- `db/migrations/083_analytics_rpc_functions.sql`

**2.2. Frontend: Basic Analytics UI (1.5-2 hours)**
- [ ] Create new page: `app/app/[org]/telegram/groups/[id]/analytics/page.tsx`
- [ ] Add navigation link in group sidebar
- [ ] Display 3 sections:
  1. **Activity Timeline** (simple bar chart or table)
  2. **Top Contributors** (list with avatars)
  3. **Silent Members** (list with warning badges)
- [ ] Use existing UI components (`Card`, `Badge`, `Table`)

**Files to create:**
- `app/app/[org]/telegram/groups/[id]/analytics/page.tsx`
- `app/api/analytics/[orgId]/group-activity/route.ts` (API wrapper for RPC)

**Success criteria:**
- ✅ Analytics page accessible from group menu
- ✅ Shows real data from database
- ✅ No UI errors, responsive layout

**Estimated time:** 3-4 hours

---

## 🔍 Evening Session (Optional, 30-45 min)

### 3. Review & Documentation

- [ ] Test analytics with real group data
- [ ] Document any edge cases found
- [ ] Update `docs/DAY_3_COMPLETE_SUMMARY.md`
- [ ] Plan priorities for Day 4

---

## 📦 Deliverables (End of Day 3)

### Must Have:
- ✅ Migration 082 applied
- ✅ All previous changes deployed and stable
- ✅ Basic analytics page with 3 sections (MVP)

### Nice to Have:
- ⭐ Visual chart for activity timeline (not just table)
- ⭐ Export analytics data to CSV

---

## 🚨 Known Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **RLS blocking analytics queries** | High | Use `supabaseAdmin` in RPC functions |
| **Slow queries for large groups** | Medium | Add indexes on `activity_events(tg_chat_id, created_at)` |
| **No historical data for new groups** | Low | Show "Import messages to see analytics" prompt |

---

## 🔄 Alternative Priorities (If User Wants to Adjust)

**Option A: Focus on Participant Profile Enrichment first**
- Extract topics from messages
- Calculate participation score
- More backend-heavy, less visual impact

**Option B: Improve Message Import UX**
- Add progress bar during import
- Show import history (past imports)
- Preview before confirming

**Option C: Quick wins from roadmap**
- Event attendance insights
- QR token security improvements
- Email digest templates

---

## 📌 Notes for User

**Please review and adjust:**
1. **Do you agree with starting Group Analytics Dashboard?** Or prefer different priority?
2. **Is 3-4 hours scope realistic for your tomorrow?** Can adjust to smaller MVP.
3. **Any specific analytics metrics you want to prioritize?** (e.g., peak hours heatmap, reply ratio)

**Current roadmap position:**
- ✅ Wave 0.1 Complete (Day 1-2)
- 🟡 Wave 0.2 Starting (Day 3-6 planned)
- ⏳ Wave 0.3 Quick Wins (Day 7-10 planned)

---

**Ready to start tomorrow! Adjust priorities as needed.** 🚀

