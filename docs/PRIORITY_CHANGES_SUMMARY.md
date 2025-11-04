# 📊 Изменения приоритетов — Сводка

**Дата:** 1 ноября 2025  
**Источник:** Обсуждение с founder после стратегического аудита

---

## 🔄 Ключевые изменения

### 1. Timeline: 12 → 16 недель

**Причина:** Solo-founder, 3-4 часа/день  
**Impact:** Более realistic сроки, меньше burnout риск

### 2. Wave 0 расширен: 2 → 6 недель

**Добавлено в Wave 0:**
- ✅ **Group Analytics Dashboard** (wow-effect)
- ✅ **Message Import JSON** (вместо HTML)
- ✅ **Participant Profile Enrichment** (auto-enrichment)

**Rationale:** Вау-эффект для первых пользователей важнее быстрой стабилизации

### 3. Payments: Приоритет сдвинут

**Было (Roadmap2):** Platform billing в Wave 1  
**Стало (Revised):**
- Wave 1a: **Client payments (manual tracking)** — clients charge members
- Wave 2: Platform billing — Orbo charges clients

**Rationale:** PMF validation сначала, monetization потом

### 4. Payment Provider: YooKassa/Tinkoff → Prodamus

**Причина:**
- Founder самозанятый → need simple integration
- Plan: ИП сначала, потом ООО
- Prodamus поддерживает оба сценария

**Impact:** Simplified legal/tax flow

### 5. Corporate Features → Postponed

**Было:** Wave 2 (weeks 9-12)  
**Стало:** Wave 3+ (after marketplace)

**Rationale:** No confirmed pilots yet

### 6. Marketplace: Wave 2 → Wave 1b

**Причина:**
- **Real external demand** (1 partner request)
- **Client custom request** (game mechanic module)
- Internal modules needed for retention (Daily Digest, Conflict Signals)

**Impact:** Marketplace earlier, corporate later

### 7. Observability: External tools → In-house minimal

**Было:** Sentry + BigQuery + log drain  
**Стало:**
- Supabase table `error_logs`
- Simple dashboard page
- Email digest 1x/day

**Rationale:** Minimize costs early

---

## 📋 Revised Priorities (Top-10)

| # | Task | Wave | Why Priority | Points |
|---|------|------|--------------|--------|
| 1 | **Group Analytics Dashboard** | 0.2 | Wow-effect | 8 |
| 2 | **Message Import (JSON)** | 0.2 | Context enrichment | 6 |
| 3 | **Participant Enrichment** | 0.2 | Auto-profiles | 5 |
| 4 | **Webhook Health Monitor** | 0.1 | Prevent silent fails | 4 |
| 5 | **Basic Observability** | 0.1 | See errors | 4 |
| 6 | **Manual Payment Tracking** | 1a | Client revenue | 5 |
| 7 | **Daily Digest Module** | 1b | Retention | 8 |
| 8 | **Conflict Signals Module** | 1b | Wow-effect | 6 |
| 9 | **Marketplace Schema** | 1b | Foundation | 3 |
| 10 | **Extension SDK** | 1b | Partner readiness | 4 |

---

## 🎯 Success Metrics (Updated)

### Wave 0 (Week 6):
- ✅ 5+ orgs using analytics dashboard **daily**
- ✅ "Wow" feedback from ≥3 test users
- ✅ 10k+ messages imported successfully
- ✅ Zero webhook failures >10min undetected

### Wave 1a (Week 10):
- ✅ 5+ orgs tracking payments (manual)
- ✅ At least 1 paid membership recorded
- ✅ Prodamus test payment successful

### Wave 1b (Week 14):
- ✅ Daily Digest delivered to 10+ orgs
- ✅ 1 external partner integrated
- ✅ Conflict alert fired (accurate)
- ✅ Marketplace UI live

### Wave 2 (Week 20):
- ✅ Platform billing live (Orbo revenue)
- ✅ 50+ active orgs
- ✅ Automated renewals working

---

## ⚠️ Deferred / Postponed

| Feature | Original Plan | New Plan | Reason |
|---------|---------------|----------|--------|
| Corporate permissions | Wave 2 | Wave 3+ | No pilots |
| Corporate offboarding | Wave 2 | Wave 3+ | No demand |
| Corporate audit UI | Wave 2 | Wave 3+ | Deprioritized |
| Platform billing | Wave 1 | Wave 2 | PMF first |
| External observability | Wave 0 | When needed | Cost minimize |
| Referral mechanics | Wave 2 | Wave 3+ | Manual first |

---

## 🔥 Next Actions (This Week)

### Immediate (Days 1-2):
1. Create migration 075 (idempotency table)
2. Setup error_logs table
3. Implement webhook health check

### Short-term (Days 3-7):
4. Replace console.* with structured logging
5. Create simple error dashboard page
6. Start Group Analytics UI design

### Planning (Week 2):
7. CTO consultant session: review Wave 0.2 architecture
8. Design mockups for analytics dashboard
9. Test message import with real data

---

## 💡 Key Insights

1. **Wow-effect > Speed**: Лучше 6 недель с great analytics, чем 2 недели без пользы
2. **Manual > Automated (early)**: Manual payments tracking unlocks client revenue fast
3. **Internal > External (marketplace)**: Prove marketplace value internally first
4. **Solo reality**: 3-4h/day = 8-10 points/week, не 20-30
5. **PMF before monetization**: Users love product → easier to charge

---

**Approved by:** Founder  
**Status:** Active roadmap  
**Next review:** Week 6 (end of Wave 0)

