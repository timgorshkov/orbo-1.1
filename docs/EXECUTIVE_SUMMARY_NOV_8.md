# Executive Summary: Orbo Apps Planning Session

**Date:** 8 ноября 2025  
**Session Duration:** 1 час  
**Status:** ✅ Aligned - Ready for Implementation  
**Start Date:** 11 ноября 2025  
**MVP Launch Target:** 8 декабря 2025

---

## 🎯 **What We're Building:**

### **Orbo Apps**
AI-генератор приложений для Telegram-сообществ

### **MVP Value Proposition:**
> "Создайте доску объявлений для вашей Telegram-группы за 5 минут.  
> Ваши 500 участников сразу могут публиковать и находить объявления."

### **Why This Wins:**
1. **Instant User Base** - подключил группу → приложение уже с пользователями (не нужно привлекать)
2. **AI-Generated** - не шаблоны, а уникальные приложения под конкретные нужды
3. **Telegram-Native** - команды ботов, уведомления, deep links
4. **Russian Servers** - данные в РФ (конкурентное преимущество после MVP)

---

## 🔑 **Key Decisions:**

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Marketplace или Конструктор?** | Конструктор first | AI-генерация кастомных приложений важнее каталога готовых решений |
| **Код или конфигурация?** | Конфигурация (JSONB) | AI генерирует JSON, не код. Безопаснее, быстрее, проще |
| **Один тип или много?** | Classifieds для MVP | Валидация спроса, но архитектура поддерживает любые типы |
| **Supabase или Selectel?** | Supabase MVP → Selectel v2 | Быстрый старт, миграция после валидации |
| **Монетизация?** | Отложено до v1.3 | Сначала спрос, потом оплата |

---

## 📅 **30-Day Plan:**

### **Week 1 (Nov 11-15): Database + Core API**
**Deliverables:**
- Migration 102 applied (apps, collections, items, reactions, comments)
- 12 API endpoints (CRUD for apps, items, moderation)
- File upload (Supabase Storage)
- RLS policies working

**Files:**
- ✅ `db/migrations/102_apps_foundation.sql` (created)
- 📋 7 new API route files

---

### **Week 2 (Nov 18-22): AI Constructor**
**Deliverables:**
- Chat UI (`/create-app` page)
- OpenAI GPT-4 integration
- Prompt engineering (Classifieds use case)
- Config generation & validation
- Preview & refinement flow

**Files:**
- 📋 Chat component (AI conversation)
- 📋 2 AI API routes (chat, generate-app)
- 📋 Validation logic
- 📋 Prompts library

**User Experience:**
```
AI: "Что будут публиковать участники?"
User: "Продажа вещей"
AI: "Нужна модерация?"
User: "Да"
AI: "Какие категории?"
User: "Авто, Техника, Одежда..."
AI: [Генерирует config]
User: [Preview] → [Создать приложение]
```

---

### **Week 3 (Nov 25-29): Web UI**
**Deliverables:**
- Apps list page (`/app/[org]/apps`)
- App detail page (`/app/[org]/apps/[appId]`)
- Items feed (grid/list view)
- Dynamic forms (based on AI-generated schema)
- Moderation queue
- Image upload

**Files:**
- 📋 3 new pages
- 📋 7 new components

**User Experience:**
- Админ видит список приложений организации
- Кликает → видит ленту объявлений
- Фильтры, поиск, сортировка
- Участники создают объявления через форму
- Модераторы одобряют/отклоняют

---

### **Week 4 (Dec 2-6): Telegram Integration**
**Deliverables:**
- Bot commands (`/post`, `/my_ads`, `/help`)
- Deep links (`t.me/bot?start=app_...`)
- Notifications (модерация, одобрение, публикация)
- End-to-end testing
- Bug fixes & polish

**Files:**
- 📋 Telegram apps service
- 📋 Notification templates

**User Experience:**
```
Участник в Telegram:
/post
→ Бот: "Создайте объявление" [Кнопка → веб-форма]
→ Заполняет форму → отправляет на модерацию
→ Получает уведомление "На модерации"

Модератор:
→ Получает уведомление в DM с кнопками [Одобрить] [Отклонить]
→ Одобряет

Группа:
→ Получает сообщение с объявлением + кнопка [Подробнее]

Участник:
→ Получает уведомление "Объявление опубликовано!"
```

---

## 🏗️ **Architecture Highlights:**

### **Universal Schema (Key Innovation):**
```sql
apps (org_id, name, type, config JSONB)
  ↓
app_collections (app_id, schema JSONB, permissions JSONB, workflows JSONB)
  ↓
app_items (collection_id, data JSONB, status, creator_id, images[])
```

**Why This Works:**
- ✅ One schema fits all app types (Classifieds, Issues, Events, Polls, Custom)
- ✅ AI generates JSON config, not code
- ✅ Universal CRUD API
- ✅ RLS ensures tenant isolation + role permissions
- ✅ Easy to extend (just add new field types)

### **AI Flow:**
```
User conversation → AI analyzes → Generates JSONB config → Validates → Creates app
```

**Example Config:**
```json
{
  "collections": [{
    "name": "listings",
    "display_name": "Объявления",
    "schema": {
      "fields": [
        { "name": "title", "type": "text", "required": true },
        { "name": "price", "type": "number", "required": false },
        { "name": "category", "type": "select", "options": ["Авто", "Техника"] },
        { "name": "photos", "type": "images", "max": 5 }
      ]
    },
    "permissions": {
      "create": ["member"],
      "read": ["all"],
      "moderate": ["admin", "moderator"]
    },
    "moderation_enabled": true
  }]
}
```

---

## 📊 **Success Metrics:**

### **MVP Complete When:**
- ✅ AI creates valid app in < 10 minutes
- ✅ Web UI shows app with items
- ✅ `/post` in Telegram creates item
- ✅ Moderation queue works
- ✅ Approved items post to group
- ✅ Photos upload successfully
- ✅ 5-10 groups actively using

### **Go/No-Go Decision (Dec 31):**

**GO (continue development) if:**
- ≥40% apps have ≥10 items created
- ≥30% members created ≥1 item
- Positive qualitative feedback from admins
- No critical bugs or performance issues

**NO-GO (pivot or pause) if:**
- Low adoption (<20% apps active after 2 weeks)
- Poor UX feedback (confusing, not useful)
- Technical issues (JSONB performance, RLS complexity)

---

## 🎯 **Competitive Positioning:**

### **Competitors:**
| Product | Strength | Our Advantage |
|---------|----------|---------------|
| **Airtable** | Powerful database + forms | ❌ No Telegram, ❌ Complexity, ✅ We're simpler + instant users |
| **Notion** | All-in-one workspace | ❌ No Telegram, ❌ Not mobile-first, ✅ We're chat-native |
| **Retool** | Internal tools builder | ❌ For devs, ❌ No social layer, ✅ We're AI-generated + community-focused |
| **Telegram Mini Apps** | Native in Telegram | ❌ Need coding, ❌ No AI, ✅ We're no-code + AI-powered |

### **Unique Value:**
1. **AI-Generated** - не нужно программировать или выбирать из шаблонов
2. **Instant User Base** - группа уже с участниками, не нужно привлекать
3. **Telegram-Native** - команды, уведомления, deep links из коробки
4. **Russian Servers** - compliance для корпоративных клиентов (after MVP)

---

## 🚀 **Post-MVP Roadmap:**

### **v1.1 (Month 2): More App Types**
- Issues/Incidents (карта проблем с геолокацией)
- Events/RSVP (календарь мероприятий)
- Requests & Offers (взаимопомощь в сообществе)

### **v1.2 (Month 3): Advanced Features**
- Comments on items
- Reactions (likes, confirms, upvotes)
- Geo map view (Яндекс.Карты)
- Full-text search (pg_search или Meilisearch)

### **v1.3 (Month 4): Monetization**
- Free tier (1 app, 50 items/month)
- Pro tier ($10/mo: 3 apps, unlimited items, analytics)
- Enterprise (custom pricing, Selectel, SLA, white-label)

### **v2.0 (Month 5-6): Marketplace?**
- User-generated apps (share with community)
- Rating & reviews
- Revenue share (80/20)
- Featured apps catalog

### **v2.1 (Month 6-7): Selectel Migration**
- Infrastructure setup (Kubernetes, PostgreSQL cluster)
- Data migration (dual-write → cutover)
- Marketing: "Ваши данные хранятся в России"
- Enterprise sales pitch

---

## 📂 **Deliverables Created Today:**

### **Documentation:**
1. ✅ `docs/ORBO_APPS_MVP_PLAN.md` - Detailed 30-day plan (20+ pages)
2. ✅ `docs/TODO_MARKETPLACE_DISCUSSION.md` - Decisions & architecture (updated)
3. ✅ `docs/EXECUTIVE_SUMMARY_NOV_8.md` - This document
4. ✅ `docs/CURRENT_STATE_NOV_7.md` - Project status (updated)

### **Database:**
1. ✅ `db/migrations/102_apps_foundation.sql` - Complete schema (500+ lines)
   - 6 tables (apps, collections, items, reactions, comments, analytics)
   - RLS policies (tenant isolation + role permissions)
   - Helper functions (permission checks, event logging)
   - Indexes (JSONB GIN, geo, timestamps)

### **Architecture Diagrams:**
1. ✅ Database schema (apps → collections → items → reactions/comments)
2. ✅ AI flow (conversation → config generation → validation → creation)
3. ✅ User journey (admin creates → members post → moderators approve → group sees)

---

## ✅ **What's Aligned:**

### **Product:**
- ✅ Clear value proposition (instant user base)
- ✅ MVP scope (Classifieds only)
- ✅ Success metrics (adoption, activation, retention)
- ✅ Go/No-Go criteria

### **Technical:**
- ✅ Universal architecture (JSONB flexibility)
- ✅ Security model (RLS + permissions)
- ✅ AI approach (config generation, not code)
- ✅ Extensibility (any app type later)

### **Business:**
- ✅ Competitive positioning (Telegram-native + AI)
- ✅ Monetization strategy (defer to Month 4)
- ✅ Data sovereignty (Selectel after validation)
- ✅ Target market (Russian Telegram communities)

---

## 🎬 **Next Steps:**

### **Tomorrow (Nov 9):**
- ☕ Rest day (no coding)
- 📖 Review documentation
- 💭 Think through edge cases

### **Monday (Nov 11):**
- 🚀 Start Week 1: Database + Core API
- Apply migration 102
- Create 12 API endpoints
- Setup file upload

### **Milestones:**
- **Nov 15:** Week 1 complete (backend ready)
- **Nov 22:** Week 2 complete (AI working)
- **Nov 29:** Week 3 complete (UI ready)
- **Dec 6:** Week 4 complete (Telegram integrated)
- **Dec 8:** MVP Launch (5-10 early adopter groups)
- **Dec 31:** Go/No-Go decision

---

## 💭 **Final Thoughts:**

### **Why This Can Win:**
1. **Clear Pain Point** - объявления в Telegram теряются через час
2. **Instant Value** - создал за 5 минут, 500 участников сразу используют
3. **Viral Mechanics** - уведомления в группу → все видят → больше используют
4. **Low Competition** - нет Telegram-native конструкторов с AI
5. **Strong Moat** - интеграция с Telegram + AI + данные в РФ

### **Risks to Watch:**
1. ⚠️ AI может генерировать невалидные схемы (решение: validation + fallback)
2. ⚠️ JSONB может быть медленным при масштабе (решение: indexes + monitoring)
3. ⚠️ Пользователи могут не понять AI (решение: четкий onboarding)
4. ⚠️ Telegram API может быть нестабильным (решение: graceful degradation)

### **What Could Go Wrong:**
- Нет спроса (пользователям не нужны приложения в группах)
- Слишком сложно (AI не может генерировать хорошие приложения)
- Конкуренция (Telegram Mini Apps станут популярными)

### **Mitigation:**
- ✅ 30-day MVP (быстрая валидация)
- ✅ 5-10 early adopters (qualitative feedback)
- ✅ Clear Go/No-Go (не тратим время на провал)

---

## 🏁 **Bottom Line:**

**Мы создаем уникальный продукт:**
- AI-генератор приложений для Telegram-сообществ
- Фокус на instant user base (не нужно привлекать пользователей)
- Telegram-native integration (команды, уведомления, deep links)
- Russian servers (competitive advantage)

**30 дней до MVP:**
- Week 1: Database + API
- Week 2: AI Constructor
- Week 3: Web UI
- Week 4: Telegram

**Критерий успеха:**
- 40% apps с ≥10 объявлениями
- 30% участников создают объявления
- Positive feedback

**Если работает → масштабируем:**
- Больше типов приложений (Issues, Events, Polls)
- Монетизация (Pro tier)
- Selectel migration (данные в РФ)
- Маркетплейс (maybe)

---

**Документация готова. Архитектура определена. План утвержден.**

**🚀 Начинаем 11 ноября!**

---

**Prepared by:** AI Assistant  
**Reviewed with:** User  
**Date:** 8 ноября 2025  
**Status:** ✅ Ready for Implementation

