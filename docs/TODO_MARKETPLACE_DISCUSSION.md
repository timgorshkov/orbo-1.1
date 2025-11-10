# Orbo Apps: AI-Constructor & Architecture Discussion

**Date:** 8 ноября 2025  
**Status:** ✅ ALIGNED - Ready to start implementation  
**Priority:** HIGH  
**Start Date:** 11 ноября 2025

---

## ✅ **Key Decisions Made:**

### **1. Telegram = User Base (Core Advantage)**
> Не просто "создай приложение", а "создай приложение для твоей группы (500 участников)" → instant user base, viral growth, social proof

### **2. Constructor > Marketplace**
> Фокус на AI-генерации кастомных приложений, НЕ на каталоге готовых решений

### **3. MVP = Classifieds Only**
> Один use case для валидации спроса, но архитектура расширяемая для любых типов (Issues, Events, Requests, Polls)

### **4. Russian Servers = Competitive Advantage**
> MVP на Supabase, после валидации → миграция на Selectel (данные в РФ)

---

## 🎯 **Refined Vision:**

**Orbo Apps** = AI-генератор приложений для Telegram-сообществ

**MVP Value Proposition:**
> "Создайте доску объявлений для вашей Telegram-группы за 5 минут. Ваши 500 участников сразу могут публиковать и находить объявления"

**Unique Advantages:**
1. ✅ **Instant User Base** - подключил группу → приложение уже с пользователями
2. ✅ **AI-Generated** - не шаблоны, а уникальные приложения под конкретные нужды
3. ✅ **Telegram-Native** - команды, уведомления, deep links
4. ✅ **Russian Servers** - данные в РФ (после MVP)

---

## 📅 **30-Day Plan (Approved):**

### **Week 1 (Nov 11-15): Database + Core API** ✅ Aligned
- Migration 102 (apps, collections, items, reactions, comments)
- Generic CRUD API (12 endpoints)
- File upload (Supabase Storage)

### **Week 2 (Nov 18-22): AI Constructor** ✅ Aligned
- Chat UI (`/create-app`)
- OpenAI integration (GPT-4)
- Config generation & validation
- Preview & refinement flow

### **Week 3 (Nov 25-29): Web UI** ✅ Aligned
- Apps list & detail pages
- Items CRUD (dynamic forms)
- Moderation queue

### **Week 4 (Dec 2-6): Telegram Integration** ✅ Aligned
- Bot commands (`/post`, `/my_ads`)
- Notifications (moderation, approval)
- Deep links
- End-to-end testing

---

## 📋 **Approved Scope:**

### **✅ IN (MVP):**
- AI-constructor (chat interface)
- Classifieds app type only
- Custom schema generation
- Web UI (feed, moderation, detail)
- Telegram integration (commands + notifications)
- Photo upload
- Categories, prices, location (text)

### **❌ OUT (v2):**
- Other app types (Issues, Events, Polls) - архитектура готова
- Marketplace catalog
- Comments & reactions
- Geo map view
- Payments
- Selectel migration (после валидации)

---

## ✅ **Resolved Decisions:**

### **1. Who creates apps?**
**Answer:** AI creates, users configure through conversation
- Not developers writing code
- Not admins selecting from templates
- **AI generates unique configs** based on natural language description

### **2. Marketplace or Constructor?**
**Answer:** Constructor first, marketplace maybe later
- Focus on AI-generation, not pre-built catalog
- Users might share apps organically later (v2.0)
- No rev-share or monetization complexity for MVP

### **3. Code generation or configuration?**
**Answer:** Configuration (JSONB schemas), not code
- AI generates JSON config (fields, permissions, workflows)
- Universal CRUD API works for all app types
- Safer, faster, more maintainable

### **4. Single app type or multiple?**
**Answer:** Classifieds only for MVP, architecture supports all
- Validate demand with one clear use case
- Database schema supports any type (JSONB flexibility)
- Easy to add Issues/Events/Polls later

### **5. Data sovereignty?**
**Answer:** Supabase MVP → Selectel after validation
- Fast start with Supabase (PostgreSQL + Storage)
- Migrate to Selectel when proven
- Market as "данные в России" for enterprise sales

### **6. Monetization?**
**Answer:** Defer to v1.3 (Month 4)
- MVP is free (validate demand first)
- Later: Free tier (1 app, 50 items) + Pro tier ($10/mo)

---

## 🏗️ **Architecture Overview:**

### **Database Schema:**
```
apps (org_id, name, type, config JSONB)
  ↓
app_collections (app_id, name, schema JSONB, permissions JSONB, workflows JSONB)
  ↓
app_items (collection_id, data JSONB, status, creator_id, images[], location)
  ↓
app_item_reactions (item_id, user_id, reaction_type)
app_item_comments (item_id, user_id, body)
```

**Key Design:**
- ✅ **Universal schema** - any app type fits
- ✅ **JSONB flexibility** - AI generates any fields
- ✅ **RLS security** - tenant isolation + role permissions
- ✅ **Extensible** - add new app types without schema changes

### **AI Flow:**
```
User → Chat with AI → AI generates config → Preview → Create app
                          ↓
                    {
                      "collections": [{
                        "name": "listings",
                        "schema": {
                          "fields": [
                            { "name": "title", "type": "text", ... },
                            { "name": "price", "type": "number", ... }
                          ]
                        },
                        "permissions": { "create": ["member"], ... },
                        "workflows": [...]
                      }]
                    }
```

### **User Journey:**
```
1. Admin: "Хочу доску объявлений"
2. AI: "Что будут публиковать? Нужна модерация? Категории?"
3. AI: Генерирует config → Preview
4. Admin: [Создать приложение]
5. App появляется в /app/[org]/apps
6. Участники: /post в Telegram → создают объявления
7. Админы: модерируют → публикуются в группу
8. Участники: находят объявления в веб-интерфейсе
```

---

## 📂 **Files to Create:**

### **Database:**
- ✅ `db/migrations/102_apps_foundation.sql` (created)

### **API (Week 1):**
- `app/api/apps/route.ts` (GET, POST)
- `app/api/apps/[appId]/route.ts` (GET, PATCH, DELETE)
- `app/api/apps/[appId]/collections/route.ts` (GET)
- `app/api/apps/[appId]/items/route.ts` (GET, POST)
- `app/api/apps/[appId]/items/[itemId]/route.ts` (GET, PATCH, DELETE)
- `app/api/apps/[appId]/items/[itemId]/moderate/route.ts` (POST)
- `app/api/apps/[appId]/upload/route.ts` (POST)

### **AI (Week 2):**
- `app/api/ai/chat/route.ts` (POST)
- `app/api/ai/generate-app/route.ts` (POST)
- `lib/ai/prompts/classifieds.ts`
- `lib/ai/validateAppConfig.ts`

### **Pages (Week 3):**
- `app/create-app/page.tsx`
- `app/app/[org]/apps/page.tsx`
- `app/app/[org]/apps/[appId]/page.tsx`

### **Components (Week 3):**
- `components/apps/ai-constructor-chat.tsx`
- `components/apps/app-preview.tsx`
- `components/apps/apps-grid.tsx`
- `components/apps/item-card.tsx`
- `components/apps/item-detail.tsx`
- `components/apps/create-item-button.tsx`
- `components/apps/moderation-queue.tsx`

### **Telegram (Week 4):**
- `lib/services/telegramAppsService.ts`

---

## 📊 **Success Criteria:**

### **MVP Complete When:**
- ✅ AI creates valid app in < 10 minutes
- ✅ Web UI shows app with items
- ✅ `/post` in Telegram creates item
- ✅ Moderation queue works
- ✅ Approved items post to group
- ✅ Photos upload successfully
- ✅ 5-10 groups actively using

### **Go/No-Go Decision (End of Month 1):**
**GO if:**
- ≥40% apps have ≥10 items
- ≥30% members created ≥1 item
- Positive qualitative feedback
- No critical bugs

**NO-GO if:**
- Low adoption (<20% apps active)
- Poor UX feedback
- Technical issues (performance, reliability)

---

## 🚀 **Ready to Start!**

**Next Actions:**
1. ✅ Architecture defined
2. ✅ 30-day plan approved
3. ✅ Migration created
4. 📋 **Tomorrow:** Apply migration, start Week 1

**Documentation:**
- See `docs/ORBO_APPS_MVP_PLAN.md` for detailed day-by-day plan
- See `db/migrations/102_apps_foundation.sql` for database schema

---

**Updated:** 8 ноября 2025  
**Status:** ✅ Aligned and ready for implementation

