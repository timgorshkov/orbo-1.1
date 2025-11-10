# Orbo Apps: MVP Implementation Plan (30 Days)

**Last Updated:** 8 ноября 2025  
**Target Launch:** 8 декабря 2025  
**Goal:** AI-генератор приложений для Telegram-сообществ

---

## 🎯 **MVP Scope:**

### **Core Value Proposition:**
> "Создайте доску объявлений для вашей Telegram-группы за 5 минут. Ваши 500 участников сразу могут публиковать и находить объявления"

### **What's IN:**
- ✅ AI-конструктор (chat interface)
- ✅ Один тип приложения: **Classifieds (Доска объявлений)**
- ✅ Генерация кастомной схемы полей
- ✅ Веб-интерфейс (лента, модерация, детальные карточки)
- ✅ Telegram-интеграция (команды `/post`, уведомления)
- ✅ Модерация объявлений
- ✅ Загрузка фото/медиа
- ✅ Категории, цены, местоположение

### **What's OUT (v2):**
- ❌ Другие типы приложений (Issues, Events, Polls) - архитектура готова, но не реализовано
- ❌ Маркетплейс готовых решений
- ❌ Комментарии к объявлениям
- ❌ Реакции (лайки, подтверждения)
- ❌ Геокарта объявлений
- ❌ Платежи/донаты
- ❌ Миграция на Selectel (будет после валидации)

---

## 🏗️ **Architecture Principles:**

### **1. Extensibility First:**
```
Сейчас: Classifieds
Потом: Issues, Events, Requests, Polls, Custom
Архитектура: Universal (любой тип данных через JSONB)
```

### **2. AI-Generated, Not Template-Based:**
```
❌ Выбор из 5 готовых шаблонов
✅ AI генерирует уникальную схему на основе диалога
✅ Пользователь описывает → AI создает
```

### **3. Telegram = User Base:**
```
Подключил группу (500 участников) → создал приложение
→ все 500 сразу могут пользоваться
→ уведомления в группу → viral growth
→ social proof (видят активность других)
```

### **4. Data Sovereignty (future):**
```
MVP: Supabase (быстрый старт)
v2: Миграция на Selectel (российские серверы)
USP: "Данные хранятся в России" (compliance, безопасность)
```

---

## 📅 **30-Day Timeline:**

### **Week 1 (Nov 11-15): Database + Core API**

#### **Day 1-2 (Nov 11-12): Database Foundation**
- [ ] Apply migration 102 (apps, collections, items, reactions, comments)
- [ ] Test RLS policies (member/admin/moderator permissions)
- [ ] Verify JSONB indexing performance
- [ ] Create seed data (test app with sample listings)

**Deliverables:**
- ✅ Migration applied to Supabase
- ✅ RLS working correctly
- ✅ Test data in place

#### **Day 3-4 (Nov 13-14): Generic CRUD API**
- [ ] `POST /api/apps` - create app (admins only)
- [ ] `GET /api/apps` - list apps for org
- [ ] `GET /api/apps/[appId]` - get app details
- [ ] `PATCH /api/apps/[appId]` - update app config
- [ ] `DELETE /api/apps/[appId]` - archive app
- [ ] `GET /api/apps/[appId]/collections` - list collections
- [ ] `POST /api/apps/[appId]/items` - create item (members)
- [ ] `GET /api/apps/[appId]/items` - list items (with filters)
- [ ] `GET /api/apps/[appId]/items/[itemId]` - item details
- [ ] `PATCH /api/apps/[appId]/items/[itemId]` - update item
- [ ] `DELETE /api/apps/[appId]/items/[itemId]` - delete item
- [ ] `POST /api/apps/[appId]/items/[itemId]/moderate` - moderate item

**Deliverables:**
- ✅ 12 API endpoints
- ✅ Structured logging (Pino)
- ✅ Admin action audit
- ✅ Error handling

#### **Day 5 (Nov 15): File Upload**
- [ ] Supabase Storage bucket for app media
- [ ] `POST /api/apps/[appId]/upload` - upload images
- [ ] Image resize/optimization (Sharp)
- [ ] RLS policies for storage bucket
- [ ] File cleanup on item delete

**Deliverables:**
- ✅ File upload working
- ✅ Images stored in Supabase Storage
- ✅ URLs returned in API responses

---

### **Week 2 (Nov 18-22): AI Constructor**

#### **Day 6-7 (Nov 18-19): Chat UI**
- [ ] Page: `/create-app` (accessible without org?)
- [ ] Component: `AIConstructorChat.tsx`
- [ ] Message history (user + AI messages)
- [ ] Input with "Send" button
- [ ] Loading states (AI thinking)
- [ ] Error handling (API failures)
- [ ] Responsive design (mobile-friendly)

**Deliverables:**
- ✅ Chat interface working
- ✅ Message persistence
- ✅ Nice UX (typing indicators, etc)

#### **Day 8-9 (Nov 20-21): AI Backend**
- [ ] OpenAI API integration
- [ ] Prompt engineering for Classifieds
- [ ] `POST /api/ai/chat` - send message, get response
- [ ] `POST /api/ai/generate-app` - finalize and create app
- [ ] Context management (conversation history)
- [ ] Validation of AI output (schema check)
- [ ] Fallback to defaults if AI fails

**AI Prompt Strategy:**
```
System: You are an AI assistant helping users create a classifieds board...

Conversation flow:
1. Ask: "What will your members post?" (items/services/etc)
2. Ask: "Do you need moderation before publishing?"
3. Ask: "Is price required, optional, or not needed?"
4. Ask: "What categories do you want?" (suggest 5-7 based on answer)
5. Ask: "Do you need location/geo?" (local community?)
6. Generate config JSON

Output format:
{
  "app": {
    "name": "...",
    "description": "...",
    "icon": "📦"
  },
  "collections": [{
    "name": "listings",
    "display_name": "Объявления",
    "schema": {
      "fields": [...]
    },
    "permissions": {...},
    "moderation_enabled": true,
    "views": ["grid", "list"]
  }]
}
```

**Deliverables:**
- ✅ OpenAI integration
- ✅ Structured prompts
- ✅ JSON validation
- ✅ App creation from AI output

#### **Day 10 (Nov 22): Preview & Refinement**
- [ ] Preview screen (show generated config)
- [ ] "Edit" button → re-chat with AI
- [ ] "Create App" button → save to DB
- [ ] Link to org selection (if multiple orgs)
- [ ] Success screen with setup instructions

**Deliverables:**
- ✅ Preview UI
- ✅ Refinement flow
- ✅ App creation finalized

---

### **Week 3 (Nov 25-29): Web UI**

#### **Day 11-12 (Nov 25-26): Apps List & Detail**
- [ ] Page: `/app/[org]/apps` - list of apps
- [ ] Component: `AppsGrid.tsx` - cards with icons, stats
- [ ] Page: `/app/[org]/apps/[appId]` - app detail
- [ ] Tabs: [Items] [Moderation] [Settings] [Analytics]
- [ ] Filters: status, category, search
- [ ] Sort: newest, oldest, price (if applicable)
- [ ] Empty state: "No items yet" + CTA

**Deliverables:**
- ✅ 2 pages working
- ✅ Navigation integrated
- ✅ Filters & search functional

#### **Day 13-14 (Nov 27-28): Items CRUD UI**
- [ ] Component: `ItemCard.tsx` - display item (grid/list view)
- [ ] Component: `ItemDetail.tsx` - full item view
- [ ] Component: `CreateItemButton.tsx` - form dialog
- [ ] Component: `EditItemButton.tsx` - edit form
- [ ] Dynamic form generation (based on collection schema)
- [ ] Image upload in form
- [ ] Category selector (dynamic)
- [ ] Location picker (optional, simple text input for MVP)

**Deliverables:**
- ✅ Item CRUD working
- ✅ Dynamic forms
- ✅ Image upload integrated

#### **Day 15 (Nov 29): Moderation Queue**
- [ ] Tab: "На модерации" (pending items)
- [ ] Component: `ModerationQueue.tsx`
- [ ] Buttons: [Одобрить] [Отклонить]
- [ ] Rejection reason (optional text)
- [ ] Batch actions (approve multiple)
- [ ] Real-time updates (optimistic UI)

**Deliverables:**
- ✅ Moderation working
- ✅ Admin action logged
- ✅ Notifications triggered (prep for Week 4)

---

### **Week 4 (Dec 2-6): Telegram Integration**

#### **Day 16-17 (Dec 2-3): Bot Commands**
- [ ] `/post` - create item (open web form or inline)
- [ ] `/my_ads` - list my items
- [ ] `/app_help` - show available commands
- [ ] Deep links: `t.me/bot?start=app_APPID_post`
- [ ] Inline form (simple: title, price, category, photo)
- [ ] Fallback to web form (if complex schema)

**Implementation:**
```typescript
// lib/services/telegramAppsService.ts
export async function handleAppCommand(
  chatId: number,
  userId: number,
  command: string,
  appId: string
) {
  if (command === '/post') {
    // Option A: Inline form (Telegram native)
    await bot.sendMessage(chatId, 'Создайте объявление:', {
      reply_markup: {
        inline_keyboard: [[
          { text: '📝 Создать', url: `https://app.orbo.ru/app/${appId}/items/new` }
        ]]
      }
    });
    
    // Option B: Conversation flow (more complex)
    // Start inline form collection...
  }
  
  if (command === '/my_ads') {
    const items = await getMyItems(userId, appId);
    // Send list with buttons [Edit] [Delete]
  }
}
```

**Deliverables:**
- ✅ Bot commands working
- ✅ Deep links functional
- ✅ Web form accessible via Telegram

#### **Day 18-19 (Dec 4-5): Notifications**
- [ ] New item created → notify moderators (DM)
- [ ] Item approved → post to group chat
- [ ] Item rejected → notify creator (DM)
- [ ] New item in category → notify subscribers (future)

**Templates:**
```
📦 Новое объявление на модерации

📌 Продаю iPhone 13
💰 45 000 ₽
📂 Техника
👤 @username

[Одобрить] [Отклонить] [Подробнее]

---

✅ Объявление одобрено!

📌 Продаю iPhone 13
💰 45 000 ₽
📂 Техника
👤 @username
📷 [3 фото]

[Подробнее] [Связаться]

---

❌ Объявление отклонено

Причина: Нарушение правил (указать конкретно)

[Редактировать] [Написать админу]
```

**Deliverables:**
- ✅ 4 типа уведомлений
- ✅ Inline buttons в Telegram
- ✅ Deep links работают

#### **Day 20 (Dec 6): Polish & Testing**
- [ ] End-to-end тестирование
- [ ] Фикс багов
- [ ] Улучшение UX
- [ ] Документация (setup guide для пользователей)
- [ ] Deploy checklist

**Final Checklist:**
- [ ] AI-конструктор создает валидное приложение
- [ ] Приложение появляется в веб-интерфейсе
- [ ] Участник может создать объявление через Telegram
- [ ] Модератор видит объявление в очереди
- [ ] Одобренное объявление публикуется в группу
- [ ] Отклоненное объявление уведомляет создателя
- [ ] Участник может редактировать свои объявления
- [ ] Фильтры и поиск работают
- [ ] Загрузка фото работает
- [ ] RLS не пропускает чужие данные

---

## 🎨 **UI/UX Mockups:**

### **1. AI Constructor Chat:**
```
┌─────────────────────────────────────────────┐
│ 🤖 Создайте приложение                [✕]  │
├─────────────────────────────────────────────┤
│                                             │
│  🤖 Привет! Я помогу создать приложение для │
│     вашей Telegram-группы.                  │
│                                             │
│     Что вы хотите добавить в группу?        │
│     • Доску объявлений                      │
│     • Карту проблем                         │
│     • События и мероприятия                 │
│     • Что-то другое                         │
│                                             │
│  👤 Доску объявлений                        │
│                                             │
│  🤖 Отлично! Доска объявлений — отличный    │
│     способ организовать обмен внутри группы.│
│                                             │
│     Что будут публиковать участники?        │
│     (Например: продажа вещей, аренда,       │
│      услуги, вакансии...)                   │
│                                             │
│  👤 Продажа и покупка вещей, иногда услуги  │
│                                             │
│  🤖 Понял! А нужна ли модерация объявлений  │
│     перед публикацией в группу?             │
│     [✓ Да, нужна модерация]                 │
│     [Нет, публиковать сразу]                │
│                                             │
│  👤 [Нажал "Да, нужна модерация"]           │
│                                             │
│  🤖 Хорошо! Должна ли быть цена обязательной│
│     в каждом объявлении?                    │
│     [Да, обязательно]                       │
│     [Нет, можно пропустить]                 │
│     [Можно, но не обязательно] ✓            │
│                                             │
│  🤖 Какие категории вам нужны? Я предлагаю: │
│     • Авто и транспорт                      │
│     • Электроника                           │
│     • Одежда и аксессуары                   │
│     • Для дома                              │
│     • Услуги                                │
│                                             │
│     [Подходит] [Изменить]                   │
│                                             │
│  👤 [Нажал "Подходит"]                      │
│                                             │
│  🤖 ⚙️ Генерирую приложение...              │
│     [████████████░░░░] 75%                  │
│                                             │
├─────────────────────────────────────────────┤
│ Ваше сообщение...               [Отправить] │
└─────────────────────────────────────────────┘
```

### **2. App Preview:**
```
┌─────────────────────────────────────────────┐
│ ✅ Приложение готово!                       │
├─────────────────────────────────────────────┤
│                                             │
│  📦 Барахолка                                │
│  Доска объявлений для вашей группы          │
│                                             │
│  ⚙️ Настройки:                              │
│  ✓ Модерация включена                       │
│  ✓ Цена опциональна                         │
│  ✓ 5 категорий                              │
│  ✓ До 5 фото в объявлении                   │
│                                             │
│  📋 Поля объявления:                        │
│  • Название (обязательно)                   │
│  • Цена (необязательно)                     │
│  • Категория (выбор из списка)              │
│  • Описание (обязательно)                   │
│  • Фотографии (до 5 шт)                     │
│  • Контакт (username)                       │
│                                             │
│  🤖 Telegram-команды:                       │
│  /post — создать объявление                 │
│  /my_ads — мои объявления                   │
│  /help — справка                            │
│                                             │
│  [Изменить настройки] [Создать приложение]  │
│                                             │
└─────────────────────────────────────────────┘
```

### **3. Apps List Page:**
```
┌─────────────────────────────────────────────┐
│ Приложения                                  │
├─────────────────────────────────────────────┤
│                                             │
│  [+ Создать приложение]                     │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 📦 Барахолка                          │  │
│  │ Доска объявлений                      │  │
│  │                                       │  │
│  │ 📊 47 объявлений | 🔔 3 на модерации  │  │
│  │ 👥 28 активных участников             │  │
│  │                                       │  │
│  │ [Открыть] [Настройки]                 │  │
│  └───────────────────────────────────────┘  │
│                                             │
└─────────────────────────────────────────────┘
```

### **4. App Detail Page (Items Feed):**
```
┌─────────────────────────────────────────────┐
│ 📦 Барахолка                                │
│ [Объявления] [На модерации (3)] [Настройки] │
├─────────────────────────────────────────────┤
│                                             │
│  🔍 Поиск...          [Категория ▼] [Все]  │
│                                             │
│  [+ Создать объявление]                     │
│                                             │
│  ┌───────┐  🚗 Продаю Honda Civic 2015     │
│  │ [IMG] │  💰 650 000 ₽ | Авто            │
│  │       │  👤 @ivan • 2 часа назад        │
│  └───────┘  [Подробнее]                     │
│                                             │
│  ┌───────┐  📱 iPhone 13 Pro 256GB         │
│  │ [IMG] │  💰 65 000 ₽ | Электроника      │
│  │       │  👤 @maria • 5 часов назад      │
│  └───────┘  [Подробнее]                     │
│                                             │
│  ┌───────┐  👕 Куртка зимняя, новая        │
│  │ [IMG] │  💰 3 500 ₽ | Одежда            │
│  │       │  👤 @alex • вчера               │
│  └───────┘  [Подробнее]                     │
│                                             │
│  [Загрузить еще...]                         │
│                                             │
└─────────────────────────────────────────────┘
```

### **5. Moderation Queue:**
```
┌─────────────────────────────────────────────┐
│ 📦 Барахолка                                │
│ [Объявления] [На модерации (3)] [Настройки] │
├─────────────────────────────────────────────┤
│                                             │
│  🔄 На модерации (3)                        │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 🚗 Продаю BMW X5 2018                │    │
│  │ 💰 2 500 000 ₽ | Авто                │    │
│  │ 👤 @newuser • 10 минут назад         │    │
│  │                                      │    │
│  │ [3 фото] [Подробнее]                 │    │
│  │                                      │    │
│  │ [✓ Одобрить] [✗ Отклонить]          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ 📱 Продам iPhone 11                  │    │
│  │ 💰 Цена не указана | Электроника     │    │
│  │ 👤 @user123 • 1 час назад            │    │
│  │                                      │    │
│  │ ⚠️ Нет фото                          │    │
│  │                                      │    │
│  │ [✓ Одобрить] [✗ Отклонить]          │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🔧 **Technical Stack:**

### **Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- React Hook Form (dynamic forms)
- Supabase Client

### **Backend:**
- Next.js API Routes
- Supabase (PostgreSQL + RLS + Storage)
- OpenAI API (GPT-4 for AI constructor)
- Pino (structured logging)

### **Telegram:**
- node-telegram-bot-api
- Webhook mode (existing setup)
- Deep links for web integration

### **Infrastructure:**
- Vercel (hosting + serverless)
- Supabase (MVP database + storage)
- **Future:** Selectel (после валидации)

---

## 📊 **Success Metrics (MVP):**

### **Week 1-2 (Launch):**
- ✅ 5-10 early adopter groups
- ✅ Each creates ≥1 app via AI constructor
- ✅ TTFA (Time to First App) < 10 minutes
- ✅ No critical bugs

### **Week 3-4 (Activation):**
- ✅ ≥50% apps have ≥10 items created
- ✅ ≥30% members create ≥1 item
- ✅ Moderation queue < 24h response time
- ✅ ≥70% items approved (not rejected)

### **Week 5-8 (Retention):**
- ✅ ≥40% apps still active (≥1 new item/week)
- ✅ ≥20% weekly active creators
- ✅ Positive feedback from 3+ groups
- ✅ Go/No-Go decision: expand or pivot

---

## 🚨 **Risks & Mitigation:**

### **Risk 1: AI generates invalid schemas**
**Mitigation:**
- Strict JSON validation
- Fallback to default template
- Manual override in UI

### **Risk 2: Users don't understand AI constructor**
**Mitigation:**
- Clear onboarding ("Ответьте на 4 вопроса")
- Examples/suggestions
- Skip AI → use default template

### **Risk 3: Telegram integration breaks**
**Mitigation:**
- Graceful degradation (web-only mode)
- Clear error messages
- Webhook health monitoring (already exists)

### **Risk 4: No demand for apps**
**Mitigation:**
- Launch with 5-10 friendly groups
- Gather qualitative feedback
- Pivot early if needed

### **Risk 5: Performance issues (JSONB queries)**
**Mitigation:**
- GIN indexes on JSONB columns
- Pagination (limit 50 items/page)
- Monitor query performance
- Optimize or denormalize if needed

---

## 🔄 **Post-MVP Roadmap:**

### **v1.1 (Month 2): More App Types**
- Issues/Incidents (карта проблем)
- Events/RSVP (мероприятия)
- Requests & Offers (взаимопомощь)

### **v1.2 (Month 3): Advanced Features**
- Comments on items
- Reactions (likes, confirms)
- Geo map view
- Advanced search (full-text)

### **v1.3 (Month 4): Monetization**
- Free tier limits (50 items, 1 app)
- Pro tier ($10/mo: unlimited items, 3 apps, advanced analytics)
- Enterprise (custom pricing, Selectel hosting, SLA)

### **v2.0 (Month 5-6): Marketplace?**
- User-generated apps (share with others)
- Rating & reviews
- Revenue share (80/20)
- App discovery

### **v2.1 (Month 6-7): Migration to Selectel**
- Setup Selectel infrastructure
- Data migration plan
- Dual-write period
- Cutover
- Marketing: "Данные в России"

---

## 📋 **Deployment Checklist:**

### **Before Launch:**
- [ ] Migration 102 applied to production
- [ ] OpenAI API key configured
- [ ] Supabase Storage bucket created
- [ ] RLS policies tested thoroughly
- [ ] Error monitoring (existing dashboard)
- [ ] Admin action audit (existing)
- [ ] Documentation for users (setup guide)

### **Launch Day:**
- [ ] Deploy to production
- [ ] Test end-to-end flow
- [ ] Invite 5-10 early adopters
- [ ] Monitor errors closely
- [ ] Be ready for hotfixes

### **Week 1 Post-Launch:**
- [ ] Daily check-ins with early adopters
- [ ] Fix critical bugs immediately
- [ ] Gather qualitative feedback
- [ ] Iterate on UX pain points

---

## 🎉 **Let's Go!**

**Start Date:** 11 ноября 2025  
**MVP Launch:** 8 декабря 2025  
**Validation Complete:** 31 декабря 2025

**Next Step:** Apply migration 102 and start Week 1! 🚀

