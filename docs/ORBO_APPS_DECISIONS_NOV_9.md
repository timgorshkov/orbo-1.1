# Orbo Apps: Critical Decisions & Implementation Plan

**Date:** 9 ноября 2025  
**Status:** ✅ CONFIRMED - Ready to implement  
**Context:** Уточнение архитектуры публичных страниц и точек входа

---

## ✅ **Confirmed Decisions:**

### **1. Public Access (Virality!)**

**Decision:** Items видны **публично** (без авторизации)

**Rationale:**
- 🌐 SEO: индексация в поисковиках
- 🚀 Viral growth: пользователи могут поделиться ссылкой
- 📱 Social sharing: deep links работают для всех

**Implementation:**
- `/p/[org]/apps` → публичный список приложений
- `/p/[org]/apps/[appId]` → публичная лента items (чтение без авторизации)
- `/p/[org]/apps/[appId]/items/[itemId]` → публичная детальная страница

**Restrictions:**
- ✅ **READ:** Все (включая неавторизованных)
- ❌ **CREATE/EDIT/DELETE:** Только авторизованные participants

---

### **2. Participants Definition**

**Decision:** Participant = участник хотя бы одной Telegram-группы организации

**Implementation:**
- Проверка через таблицу `participants`
- `participant.org_id` + `participant.tg_user_id`
- Авторизация через `/api/auth/telegram`

**Permissions:**
```typescript
// Check if user is participant
const { data: participant } = await supabase
  .from('participants')
  .select('id')
  .eq('org_id', orgId)
  .eq('tg_user_id', telegramUserId)
  .maybeSingle();

if (!participant) {
  return "Access denied: Not a community member";
}
```

---

### **3. Moderators = Admins**

**Decision:** Модераторы = `admin` + `owner` роли в `memberships`

**Implementation:**
- Используем существующие роли `memberships.role`
- Не добавляем отдельную роль `moderator` (для MVP)
- v2.0: можем добавить роль `moderator` если нужна гранулярность

**Permissions check:**
```typescript
const { data: membership } = await supabase
  .from('memberships')
  .select('role')
  .eq('org_id', orgId)
  .eq('user_id', userId)
  .single();

const canModerate = ['admin', 'owner'].includes(membership.role);
```

---

### **4. Author Contacts = Telegram**

**Decision:** Показываем `@telegram_username` + кнопка "💬 Написать"

**Implementation:**
```tsx
// На детальной странице item
<div className="author-contact">
  <span>Автор: @{participant.username}</span>
  <a 
    href={`https://t.me/${participant.username}`}
    target="_blank"
    className="btn-primary"
  >
    💬 Написать в Telegram
  </a>
</div>
```

**Future (v2.0):**
- Комментарии под items
- Встроенный чат

---

### **5. Single Collection per App (MVP)**

**Decision:** 1 collection на приложение для MVP

**Rationale:**
- Упрощает UI/UX
- Упрощает AI prompt
- Достаточно для валидации спроса

**AI Prompt:**
```
Генерируй ровно 1 collection для приложения.
Все items будут храниться в этой коллекции.
```

**Future (v2.0):**
- Multiple collections (Example: "Events" + "RSVPs")

---

### **6. Views: Grid + List (MVP)**

**Decision:** Поддерживаем 2 вида отображения

**Implementation:**
- **Grid view:** Карточки с изображениями (по умолчанию)
- **List view:** Компактный список

**UI:**
```tsx
<div className="view-switcher">
  <button onClick={() => setView('grid')}>🔲 Grid</button>
  <button onClick={() => setView('list')}>📄 List</button>
</div>
```

**Critical:** Главное — поддержка изображений!

**Future (v2.0):**
- Map view (требует geo coordinates)
- Calendar view (для событий)
- Board view (для issue tracker)

---

### **7. Automatic Filters**

**Decision:** Автоматическая генерация фильтров на основе `schema.fields`

**Implementation Logic:**
```typescript
// Генерируем фильтр для каждого select field
collection.schema.fields.forEach(field => {
  if (field.type === 'select') {
    renderFilter(field.name, field.options);
  }
});

// Автоматическая сортировка
const sortOptions = [
  { label: 'Новые', value: 'created_at_desc' },
  { label: 'Старые', value: 'created_at_asc' },
];

// Если есть price field
if (hasPriceField) {
  sortOptions.push(
    { label: 'Дешевле', value: 'price_asc' },
    { label: 'Дороже', value: 'price_desc' }
  );
}
```

**Future:** Кастомные фильтры на основе требований пользователей

---

### **8. AI Editing + Logging (CRITICAL!)**

**Decision:** Минимальное редактирование через AI + логирование всех запросов

**A) AI Editing for MVP:**

Кнопка **"🤖 Редактировать"** на странице `/app/[org]/apps/[appId]`

**Flow:**
1. Пользователь: "Добавь поле 'Состояние товара'"
2. AI видит текущую конфигурацию
3. AI генерирует обновлённую конфигурацию
4. Preview → Применить
5. Старые items сохраняются (новые поля = null)

**B) AI Requests Logging (NEW REQUIREMENT!):**

Таблица `ai_requests` для анализа:

```sql
CREATE TABLE ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User context
  user_id UUID REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  
  -- Request details
  request_type TEXT NOT NULL, -- 'create_app', 'edit_app', 'chat_message'
  user_message TEXT NOT NULL, -- Что спросил пользователь
  ai_response TEXT, -- Что ответил AI
  
  -- Generated config (if applicable)
  generated_config JSONB,
  was_applied BOOLEAN DEFAULT false, -- Применил ли пользователь конфиг
  
  -- AI metadata
  model TEXT, -- 'gpt-4', 'gpt-3.5-turbo'
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  
  -- App context (if editing)
  app_id UUID REFERENCES apps(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_requests_org ON ai_requests(org_id);
CREATE INDEX idx_ai_requests_user ON ai_requests(user_id);
CREATE INDEX idx_ai_requests_type ON ai_requests(request_type);
CREATE INDEX idx_ai_requests_created ON ai_requests(created_at DESC);
```

**Суперадминка UI:**
- `/superadmin/ai-requests` — список всех запросов
- Фильтры: по типу, по дате, по пользователю
- Колонки: User, Org, Type, Message, Config, Applied, Tokens, Cost
- Детальный просмотр: полный диалог + generated config

**Use Cases:**
- 📊 Аналитика: какие типы приложений создают
- 💡 Product insights: что просят пользователи
- 🐛 Debugging: почему AI сгенерировал плохой конфиг
- 💰 Cost tracking: сколько стоит AI

---

## 📋 **Implementation Plan (Updated):**

### **Week 3: Public Pages + Dynamic UI**

#### **Day 11 (Nov 9, Сегодня):**

**1. Migration: AI Requests Logging**
```sql
-- 103_ai_requests_logging.sql
CREATE TABLE ai_requests (...);
```

**2. Update AI Constructor Service**
```typescript
// lib/services/aiConstructorService.ts
export async function logAIRequest(params: {
  userId: string;
  orgId: string | null;
  requestType: 'create_app' | 'edit_app' | 'chat_message';
  userMessage: string;
  aiResponse: string;
  generatedConfig?: any;
  model: string;
  tokensUsed: number;
  costUsd: number;
  appId?: string;
}) {
  await supabaseAdmin.from('ai_requests').insert({...});
}
```

**3. Superadmin AI Requests Page**
```typescript
// app/superadmin/ai-requests/page.tsx
// API: /api/superadmin/ai-requests
```

**4. Public Apps List Page**
```typescript
// app/p/[org]/apps/page.tsx
// Публичный список приложений (без авторизации)
```

---

#### **Day 12 (Nov 10):**

**5. Public Items Feed Page**
```typescript
// app/p/[org]/apps/[appId]/page.tsx
// Динамическая лента items (grid/list view)
```

**6. Dynamic Item Card Component**
```typescript
// components/apps/dynamic-item-card.tsx
// Универсальная карточка на основе schema
```

**7. Automatic Filters & Sort**
```typescript
// components/apps/items-filters.tsx
// Генерация фильтров из select fields
```

---

#### **Day 13 (Nov 11):**

**8. Create Item Page (Auth Required)**
```typescript
// app/p/[org]/apps/[appId]/create/page.tsx
// Проверка: is participant? → show form : redirect to auth
```

**9. Dynamic Form Component**
```typescript
// components/apps/dynamic-form.tsx
// Генерация inputs из schema.fields
// Image upload support
```

---

#### **Day 14 (Nov 12):**

**10. Item Detail Page**
```typescript
// app/p/[org]/apps/[appId]/items/[itemId]/page.tsx
// Публичная детальная страница
// Показываем @username автора + кнопку "Написать"
```

**11. Edit App via AI**
```typescript
// app/app/[org]/apps/[appId] → кнопка "🤖 Редактировать"
// Открывает чат с контекстом текущей конфигурации
// Итеративные изменения
```

**12. Moderation Queue (Admins)**
```typescript
// app/app/[org]/apps/[appId]/moderation
// Список pending items
// Approve/Reject actions
```

---

### **Week 4: Telegram Integration**

*(План остаётся без изменений)*

---

## 🎯 **Key Components (Universal!):**

### **1. `<DynamicItemCard />`**
Рендерит карточку на основе `schema.fields`

```tsx
interface DynamicItemCardProps {
  item: AppItem;
  schema: CollectionSchema;
  view: 'grid' | 'list';
}

// Logic:
// - Находим поля с type: 'image' → показываем фото
// - Находим поля с type: 'text' и name: 'title' → заголовок
// - Находим поля с type: 'price' → цена
// - Находим поля с type: 'select' и name: 'category' → badge
```

---

### **2. `<DynamicForm />`**
Генерирует форму на основе `schema.fields`

```tsx
interface DynamicFormProps {
  fields: SchemaField[];
  onSubmit: (data: Record<string, any>) => void;
}

// Logic:
// fields.forEach(field => {
//   switch (field.type) {
//     case 'text': renderInput();
//     case 'textarea': renderTextarea();
//     case 'select': renderSelect(field.options);
//     case 'number': renderNumberInput();
//     case 'price': renderPriceInput();
//     case 'image': renderImageUpload();
//   }
// });
```

---

### **3. `<ItemsFilters />`**
Автоматическая генерация фильтров

```tsx
interface ItemsFiltersProps {
  schema: CollectionSchema;
  onFilterChange: (filters: Record<string, any>) => void;
}

// Logic:
// schema.fields
//   .filter(field => field.type === 'select')
//   .forEach(field => {
//     renderFilterDropdown(field.name, field.options);
//   });
```

---

## 🚀 **Ready to Start!**

**Приоритет 1 (Сегодня):**
1. ✅ Migration: `ai_requests` table
2. ✅ Update AI service: log все запросы
3. ✅ Superadmin page: `/superadmin/ai-requests`
4. ✅ Public apps list: `/p/[org]/apps`

**Начинаем?** 🎯

