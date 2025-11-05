# UI Strategy: Custom Attributes Display

**Date:** November 5, 2025  
**Context:** How to display participant enrichment in UI

---

## 🎯 **Core Principle:**

**Разделение полей на 3 категории:**

1. **AI Insights** (Read-only) - Auto-extracted, показываем как "магию"
2. **Goals & Offers** (Editable) - User-defined, админ/участник может редактировать
3. **Event Behavior** (Read-only) - Auto-calculated, статистика

---

## 📊 **Field Classification:**

### 1. **AI Insights (Read-Only)** ✅

**Показываем:**
- `interests_keywords` → Tags/badges
- `city_inferred` → Badge with confidence indicator
- `city_confidence` → % или icon
- `behavioral_role` → Badge (Помощник/Связующий/Наблюдатель)
- `role_confidence` → %
- `topics_discussed` → Bar chart (top 5)
- `communication_style` → Stats (% questions, % answers, reply rate)

**Скрываем:**
- `interests_weights` (техническое, не нужно пользователю)

**UI:**
- Badge с "Автоматически" indicator
- Иконка "refresh" для manual re-enrichment (только админ)
- Tooltip: "Обновлено: дата"

---

### 2. **Goals & Offers (Editable)** ✏️

**Показываем и даём редактировать:**
- `goals_self` → Textarea (500 chars max)
- `offers` → Tag input (массив строк)
- `asks` → Tag input (массив строк)
- `city_confirmed` → Text input или autocomplete
- `bio_custom` → Text input (100 chars max)

**UI:**
- Кнопка "Редактировать" (админ всегда, участник - если включено)
- Inline editing или modal (на выбор)
- Auto-save или explicit "Сохранить"

**Permissions:**
- **Admin:** Может редактировать для любого участника
- **Participant:** Может редактировать свой профиль (если включено в настройках org)

---

### 3. **Event Behavior (Read-Only)** 📈

**Показываем:**
- `event_attendance.online_rate` → % (зелёный badge)
- `event_attendance.offline_rate` → % (синий badge)
- `event_attendance.no_show_rate` → % (красный если > 30%)
- `event_attendance.total_events` → Number
- `event_attendance.last_attended` → Date

**UI:**
- Card with stats
- Visual indicators (цвета для good/bad rates)
- Tooltip: explanation (что значит no-show rate)

---

### 4. **Meta Fields (Hidden)** ❌

**НЕ показываем:**
- `last_enriched_at` (только в debug mode)
- `enrichment_version` (техническое)
- `enrichment_source` (техническое)
- `interests_weights` (техническое)

**Except:**
- В debug mode (superadmin only) можно показать в collapsed section

---

## 🖼️ **UI Layout:**

### **Profile Page Structure:**

```
┌─────────────────────────────────────────────┐
│ Participant Header (name, avatar, role)     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 1. AI INSIGHTS        [Автоматически] [🔄] │
├─────────────────────────────────────────────┤
│ Интересы: [PPC] [Рекрутинг] [Мероприятия]  │
│ Город: [Москва] (уверенность 83%)          │
│ Роль: [Помощник] (72%)                      │
│ Стиль общения: 30% вопросы, 70% ответы     │
│ Обсуждаемые темы: [Bar chart]               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 2. ЦЕЛИ И ПРЕДЛОЖЕНИЯ    [Редактировать]    │
├─────────────────────────────────────────────┤
│ Город (подтверждён): [Москва]               │
│ Мои цели: Найти подрядчика по веб-дизайну  │
│ Чем могу помочь: [Консультации по PPC]     │
│ Что мне нужно: [Помощь с Яндекс Директ]    │
│ О себе: Специалист по контекстной рекламе  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 3. УЧАСТИЕ В МЕРОПРИЯТИЯХ [Автоматически]  │
├─────────────────────────────────────────────┤
│ Онлайн: 60%  │  Оффлайн: 90%               │
│ No-show: 10% │  Всего: 15 событий          │
│ Последнее участие: 28 октября 2025          │
└─────────────────────────────────────────────┘
```

---

## 🔧 **Components Created:**

### 1. **Display Component** ✅
`components/members/enriched-profile-display.tsx`

**Props:**
- `participant` - Participant object
- `isAdmin` - Boolean (show edit button)
- `onEdit` - Callback to open edit mode

**Features:**
- 3 separate sections (AI Insights, Goals & Offers, Event Behavior)
- Responsive layout
- Confidence indicators
- Empty states

---

### 2. **Edit Component** ✅
`components/members/enriched-profile-edit.tsx`

**Props:**
- `participantId` - UUID
- `currentAttributes` - Current custom_attributes
- `onSave` - Async callback (saves to DB)
- `onCancel` - Callback to close edit mode

**Features:**
- Only edits user-defined fields
- Tag input for offers/asks
- Textarea for goals
- Character limits (goals: 500, bio: 100)
- Loading state during save

---

## 📱 **Integration Example:**

```tsx
// app/app/[org]/members/[id]/page.tsx

'use client';

import { useState } from 'react';
import { EnrichedProfileDisplay } from '@/components/members/enriched-profile-display';
import { EnrichedProfileEdit } from '@/components/members/enriched-profile-edit';

export default function ParticipantProfilePage({ params }) {
  const [isEditing, setIsEditing] = useState(false);
  const [participant, setParticipant] = useState(/* fetch from API */);
  
  const handleSave = async (updates: Record<string, any>) => {
    // Call API to update custom_attributes
    const response = await fetch(`/api/participants/${params.id}/enrich`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    
    if (response.ok) {
      const updated = await response.json();
      setParticipant(updated);
      setIsEditing(false);
    }
  };
  
  return (
    <div>
      {/* Header */}
      <h1>{participant.full_name}</h1>
      
      {/* Enrichment Display/Edit */}
      {isEditing ? (
        <EnrichedProfileEdit
          participantId={participant.id}
          currentAttributes={participant.custom_attributes}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <EnrichedProfileDisplay
          participant={participant}
          isAdmin={true}
          onEdit={() => setIsEditing(true)}
        />
      )}
    </div>
  );
}
```

---

## 🔐 **Permissions Strategy:**

### **Who Can See What:**

| Role | AI Insights | Goals & Offers | Event Behavior | Can Edit |
|------|-------------|----------------|----------------|----------|
| **Owner** | ✅ All | ✅ All | ✅ All | ✅ Yes |
| **Admin** | ✅ All | ✅ All | ✅ All | ✅ Yes |
| **Member** | ✅ Org-wide | ✅ Org-wide | ❌ No | ❌ No |
| **Participant (self)** | ✅ Own | ✅ Own | ✅ Own | ✅ Own only |

**Settings:**
- Org can enable "Participants can edit their profiles"
- Org can control visibility of certain fields (privacy)

---

## 🎨 **Visual Design:**

### **Badges:**
- **AI Insights:** Light blue badge "Автоматически"
- **Confidence:** Color-coded (green: 80%+, yellow: 60-80%, gray: <60%)
- **Role:** Blue badge with icon (💬 Помощник, 🔗 Связующий, 👁️ Наблюдатель, 📢 Вещатель)

### **Colors:**
- **Good metrics:** Green (#10b981)
- **Warning metrics:** Yellow (#f59e0b)
- **Bad metrics:** Red (#ef4444)
- **Neutral:** Gray (#6b7280)

### **Empty States:**
- "Пока не заполнено" (if no data)
- Suggestion: "AI обогатит профиль после анализа сообщений"

---

## ⚡️ **Performance:**

### **Optimization:**
- Load `custom_attributes` as JSONB (single field)
- No extra JOIN for enrichment data
- Client-side parsing (no server overhead)
- Cache enrichment for 5 minutes

### **Lazy Loading:**
- "Event Behavior" section loads on scroll (optional)
- Topics chart loads async (if > 10 topics)

---

## 🚀 **Next Steps:**

### **Day 3-5: Build Enrichment Service**
Now that UI is defined, we know exactly what data we need to extract:
1. City detector → `city_inferred`, `city_confidence`
2. Interest extractor → `interests_keywords`, `topics_discussed`
3. Role classifier → `behavioral_role`, `role_confidence`
4. Style analyzer → `communication_style`

### **Day 6-7: Enrichment Pipeline**
Build API endpoints and cron jobs to populate these fields automatically.

### **Day 11-13: Integrate UI**
Wire up the display/edit components to actual data.

---

## ✅ **Summary:**

**Decision Made:**
- ✅ AI fields are **read-only** (показываем как insight, не даём редактировать)
- ✅ User fields are **editable** (goals, offers, asks, city_confirmed, bio)
- ✅ Meta fields are **hidden** (last_enriched_at, version, weights)
- ✅ Admin can edit any participant, participant can edit own (if enabled)

**Components Ready:**
- ✅ `enriched-profile-display.tsx` - Display component
- ✅ `enriched-profile-edit.tsx` - Edit component

**Next:** Build enrichment service (Day 3-5) 🚀

---

**Status:** ✅ UI Strategy Defined  
**Next:** Day 3 - City Detector

