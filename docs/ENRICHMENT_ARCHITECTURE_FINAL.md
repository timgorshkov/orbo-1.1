# Participant Enrichment: Final Architecture

**Date:** November 5, 2025  
**Status:** ✅ Complete - Ready for Implementation  
**Revised:** Based on user feedback (AI-based, not rule-based)

---

## 🎯 **Core Principles:**

1. ✅ **AI-Based Interest Extraction** (ChatGPT API, not TF-IDF)
2. ✅ **Manual Trigger** (Owner/Admin button, cost-conscious)
3. ✅ **Custom Fields Protection** (System fields reserved)
4. ✅ **Context-Aware** (Neighboring messages for AI)
5. ✅ **Recent Asks Priority** (Last 1-2 weeks)
6. ✅ **Reaction Analysis** (Who reacts to what)

---

## 📊 **Architecture Overview:**

```
┌─────────────────────────────────────────────────┐
│              Owner/Admin UI                     │
│  [Оценить стоимость] → [Запустить AI-анализ]   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│       API: /api/participants/[id]/enrich-ai     │
│  - GET: Cost estimation                         │
│  - POST: Run enrichment                         │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│      ParticipantEnrichmentService               │
│  Orchestrates all enrichment modules            │
└─────────────────────────────────────────────────┘
           ↓              ↓              ↓
    ┌──────────┐   ┌───────────┐  ┌────────────┐
    │ OpenAI   │   │ Reaction  │  │ Role       │
    │ Service  │   │ Analyzer  │  │ Classifier │
    │ (AI)     │   │ (Rule)    │  │ (Rule)     │
    └──────────┘   └───────────┘  └────────────┘
           ↓              ↓              ↓
┌─────────────────────────────────────────────────┐
│         participants.custom_attributes          │
│  (JSONB with system fields protection)          │
└─────────────────────────────────────────────────┘
```

---

## 🔐 **1. Custom Fields Protection**

### **Reserved Fields:**

**Cannot be edited by owners** (system-managed):
- All fields starting with: `ai_`, `system_`, `enrichment_`, `_`
- Specific fields:
  - `interests_keywords`
  - `topics_discussed`
  - `recent_asks`
  - `city_inferred`, `city_confidence`
  - `behavioral_role`, `role_confidence`
  - `reaction_patterns`
  - `last_enriched_at`, `enrichment_version`, `enrichment_source`

**Can be edited by owners/admins:**
- `goals_self` (participant's goals)
- `offers` (what they can help with)
- `asks` (what they need)
- `city_confirmed` (user-confirmed city)
- `bio_custom` (custom bio)
- **Any custom field** (e.g., `department`, `tenure`, `custom_badge`)

### **Protection Mechanism:**

```typescript
// lib/services/enrichment/customFieldsManager.ts

// Owner tries to edit AI field (blocked)
const userInput = { 
  interests_keywords: ['hacking'],  // ❌ Blocked
  department: 'IT'                  // ✅ Allowed
};

const sanitized = sanitizeCustomAttributes(userInput);
// Result: { department: 'IT' }

// AI enrichment (allowed)
const aiUpdates = { interests_keywords: ['PPC', 'marketing'] };
const merged = mergeCustomAttributes(current, aiUpdates, { 
  allowSystemFields: true  // ✅ Allowed for AI
});
```

**Files:**
- ✅ `lib/services/enrichment/customFieldsManager.ts`

---

## 🤖 **2. AI-Based Enrichment (ChatGPT API)**

### **What AI Extracts:**

1. **Interests & Expertise** (5-10 keywords)
   - Что участник обсуждает
   - В чём проявляет экспертизу
   - Только существительные/фразы

2. **Recent Asks/Questions** (Last 1-2 weeks)
   - Что ищет или спрашивает
   - Приоритет на свежие (14 дней)

3. **City/Location** (if mentioned)
   - Confidence: 0.9 if explicit ("Я в Москве")
   - Confidence: 0.5 if implicit ("московские события")

4. **Topics Discussed** (with counts)
   - Topic → number of mentions

### **Context-Aware:**

AI получает не только сообщения участника, но и **контекст**:
- Предыдущие сообщения (до и после)
- Указание, какие сообщения от анализируемого участника
- Group keywords (из `telegram_groups.keywords`)

### **Cost-Conscious:**

- **Model:** `gpt-4o-mini` (cheaper)
- **Estimated cost:** ~$0.0002-0.001 per participant (~0.02-0.10 ₽)
- **Token limit:** 1000 output tokens
- **Message limit:** Top 50 recent messages
- **Manual trigger:** Owner/Admin button only

**Files:**
- ✅ `lib/services/enrichment/openaiService.ts`

---

## 📊 **3. Reaction Analysis (Rule-Based)**

### **What We Analyze:**

1. **Favorite Emojis** (top 5)
2. **Sentiment** (positive/negative/neutral based on emojis)
3. **Reacts To Topics** (keywords from messages they reacted to)
4. **Reacts To Users** (who they react to most)
5. **Engagement Rate** (reactions / messages)

### **Data Source:**

- `activity_events` where `event_type = 'reaction'`
- `tg_user_id` (who reacted)
- `message_id` (what message)
- `meta.emoji` (reaction emoji)
- Join with original message to get content & author

### **Result:**

```json
{
  "reaction_patterns": {
    "total": 45,
    "favorite_emojis": [
      { "emoji": "👍", "count": 15 },
      { "emoji": "❤️", "count": 10 }
    ],
    "reacts_to_topics": ["дизайн", "веб-разработка"],
    "sentiment": "positive"
  }
}
```

**Files:**
- ✅ `lib/services/enrichment/reactionAnalyzer.ts`

---

## 🎭 **4. Behavioral Role Classification (Rule-Based)**

### **Roles:**

| Role | Criteria | Description |
|------|----------|-------------|
| **Helper** 💬 | reply_rate > 0.5, received_rate > 0.3 | Активно помогает, отвечает на вопросы |
| **Bridge** 🔗 | unique_contacts > 8, reply_rate > 0.4 | Связующее звено, общается со многими |
| **Observer** 👁️ | messages < 5 or reaction_ratio > 2 | Наблюдатель, следит за обсуждениями |
| **Broadcaster** 📢 | messages > 15, reply_rate < 0.25 | Делится информацией, не вступает в диалог |

### **Confidence:**

- 0.6-0.7: Low confidence (default observer)
- 0.7-0.85: Medium confidence
- 0.85-0.95: High confidence

**Files:**
- ✅ `lib/services/enrichment/roleClassifier.ts`

---

## 🔄 **5. Main Enrichment Service**

### **Flow:**

1. **Fetch participant data** (id, org_id, tg_user_id)
2. **Fetch messages** (last 90 days, up to 200)
3. **Fetch reactions** (last 90 days)
4. **Fetch group keywords** (for AI context)
5. **Calculate activity stats** (for role classification)
6. **(Optional) Run AI analysis** (if `useAI=true`)
7. **Classify role** (rule-based)
8. **Analyze reactions** (rule-based)
9. **Merge custom_attributes** (with system fields protection)
10. **Save to DB** (update `participants.custom_attributes`)

### **Options:**

```typescript
enrichParticipant(participantId, orgId, {
  useAI: true,              // Use ChatGPT (costs money)
  includeBehavior: true,    // Classify role (rule-based, free)
  includeReactions: true,   // Analyze reactions (rule-based, free)
  daysBack: 90              // History window
});
```

**Files:**
- ✅ `lib/services/participantEnrichmentService.ts`

---

## 🖼️ **6. UI Components**

### **AI Enrichment Button** (Owner/Admin Only)

**Features:**
- "Оценить стоимость" button
- Cost estimation display (₽ and $)
- "Запустить AI-анализ" button with confirmation
- Progress indicator
- Results summary
- Error handling

**Location:** Participant profile page (admins only)

**Files:**
- ✅ `components/members/ai-enrichment-button.tsx`

---

### **Enriched Profile Display**

**3 Sections:**
1. **AI Insights** (read-only) - Interests, city, role, topics
2. **Goals & Offers** (editable) - Goals, offers, asks, bio
3. **Event Behavior** (read-only) - Attendance rates

**Files:**
- ✅ `components/members/enriched-profile-display.tsx`
- ✅ `components/members/enriched-profile-edit.tsx`

---

## 📡 **7. API Endpoints**

### **GET /api/participants/[id]/enrich-ai**

**Query params:** `orgId`, `daysBack`  
**Returns:** Cost estimation
```json
{
  "messageCount": 45,
  "estimatedTokens": 4700,
  "estimatedCostUsd": 0.0007,
  "estimatedCostRub": 0.07
}
```

---

### **POST /api/participants/[id]/enrich-ai**

**Body:**
```json
{
  "orgId": "...",
  "useAI": true,
  "includeBehavior": true,
  "includeReactions": true,
  "daysBack": 90
}
```

**Returns:** Enrichment result
```json
{
  "success": true,
  "messagesAnalyzed": 45,
  "reactionsAnalyzed": 12,
  "costUsd": 0.0008,
  "summary": {
    "interests": 7,
    "recentAsks": 2,
    "city": "Москва",
    "role": "helper",
    "roleConfidence": 0.87
  }
}
```

**Files:**
- ✅ `app/api/participants/[id]/enrich-ai/route.ts`

---

## 🔧 **8. Environment Variables**

### **Required:**

```bash
# .env.local
OPENAI_API_KEY=sk-proj-...
```

**Setup:**
1. Get API key from https://platform.openai.com/api-keys
2. Add to Vercel Environment Variables
3. Redeploy

---

## 📊 **9. Database Schema**

### **custom_attributes Structure:**

```json
{
  // AI-extracted (system fields)
  "interests_keywords": ["PPC", "веб-дизайн", "аналитика"],
  "topics_discussed": { "PPC": 15, "дизайн": 8, "аналитика": 12 },
  "recent_asks": [
    "Ищу подрядчика по веб-дизайну",
    "Помощь с настройкой Яндекс Директ"
  ],
  "city_inferred": "Москва",
  "city_confidence": 0.83,
  "behavioral_role": "helper",
  "role_confidence": 0.87,
  "reaction_patterns": {
    "total": 45,
    "favorite_emojis": [{ "emoji": "👍", "count": 15 }],
    "reacts_to_topics": ["дизайн"],
    "sentiment": "positive"
  },
  
  // User-editable
  "goals_self": "Найти подрядчика по веб-дизайну",
  "offers": ["Консультации по PPC"],
  "asks": ["Помощь с Яндекс Директ"],
  "city_confirmed": "Москва",
  "bio_custom": "Специалист по контекстной рекламе",
  
  // Custom fields (owner can add)
  "department": "Marketing",
  "tenure": "2 years",
  
  // Meta
  "last_enriched_at": "2025-11-05T12:00:00Z",
  "enrichment_version": "1.0",
  "enrichment_source": "ai",
  "ai_analysis_cost": 0.0008,
  "ai_analysis_tokens": 4850
}
```

---

## ✅ **Summary: What Changed from Original Plan**

| Aspect | Original Plan | Final Architecture |
|--------|---------------|-------------------|
| **Interest Extraction** | TF-IDF (rule-based) ❌ | ChatGPT API (AI) ✅ |
| **Trigger** | Automatic (cron) ❌ | Manual (owner button) ✅ |
| **City Detection** | Regex patterns | AI + Regex fallback ✅ |
| **Asks/Questions** | Not planned | AI extracts recent asks ✅ |
| **Reactions** | Not planned | Full reaction analysis ✅ |
| **Style Analysis** | Planned | Removed (not needed) ✅ |
| **Custom Fields** | No protection | Full protection ✅ |
| **Context** | No context | Neighboring messages ✅ |

---

## 🚀 **Next Steps:**

### **Day 3-5 (Completed):** ✅
- ✅ Custom fields manager
- ✅ OpenAI service
- ✅ Reaction analyzer
- ✅ Role classifier
- ✅ Main enrichment service
- ✅ API endpoint
- ✅ UI components

### **Day 6-7:** Integration
- [ ] Add AI Enrichment button to participant profile page
- [ ] Test with real data
- [ ] Deploy to production
- [ ] Add OPENAI_API_KEY to Vercel

### **Day 8-10:** Weekly Digest
- [ ] Use enrichment data for digest generation
- [ ] Telegram notifications

---

## 📞 **FAQ:**

### **Q: Почему не автоматически?**
**A:** AI стоит денег (~$0.001 за участника). Автоматика приведёт к высоким затратам. Ручной запуск даёт контроль.

### **Q: Как часто обогащать?**
**A:** По необходимости:
- После импорта истории
- Раз в месяц для активных участников
- При подготовке к мероприятиям

### **Q: Можно ли использовать бесплатный AI?**
**A:** Можно добавить fallback на локальные модели (HuggingFace), но качество будет ниже.

### **Q: Что если участник мало пишет?**
**A:** AI всё равно попытается извлечь информацию. Если < 5 сообщений, лучше пропустить AI (дорого/бесполезно).

### **Q: Как защитить от случайной перезаписи AI полей?**
**A:** `customFieldsManager` автоматически фильтрует системные поля при редактировании админом.

---

**Status:** ✅ Architecture Complete  
**Ready for:** Day 6-7 Integration

---

**Total Files Created:** 7
1. `lib/services/enrichment/customFieldsManager.ts`
2. `lib/services/enrichment/openaiService.ts`
3. `lib/services/enrichment/reactionAnalyzer.ts`
4. `lib/services/enrichment/roleClassifier.ts`
5. `lib/services/participantEnrichmentService.ts`
6. `app/api/participants/[id]/enrich-ai/route.ts`
7. `components/members/ai-enrichment-button.tsx`

