# 📊 Стратегический анализ и план развития Orbo 1.1

**Дата:** 1 ноября 2025  
**Автор:** AI Assistant (на основе внешнего аудита и стратегических документов)  
**Статус:** Рекомендации для обсуждения

---

## 🎯 Executive Summary

### Текущее положение
**Orbo 1.1** — работающий MVP с сильным Telegram ingestion stack'ом и базовым CRM. Платформа обслуживает **220 активных организаций** и готова к росту, но требует срочной стабилизации перед масштабированием.

### Ключевые находки
1. ✅ **Сильные стороны**: Зрелая Telegram интеграция, rich participant enrichment, работающий event QR flow
2. ⚠️ **Критические риски**: Service-role security gaps, отсутствие observability, ручной tenant mapping
3. ❌ **Блокеры роста**: Нет payments/billing, нет corporate features, нет marketplace infrastructure

### Стратегическая рекомендация
**Немедленно реализовать Wave 0** (2 недели стабилизации), затем **Wave 1** (6 недель MVP-fit) перед запуском роста. **Не начинать Wave 2 без завершения Wave 0-1.**

---

## 📈 Анализ по документам

### 1. Audit.md — Функциональный аудит

#### Архитектура
```
Next.js 14 (App Router) → Vercel Serverless
↓
Supabase (Postgres + Auth + Storage)
↓
Telegram Bot API + Mailgun
```

**Оценка:** 7/10
- ✅ Solid foundation для MVP
- ⚠️ Serverless без background workers создает ограничения для долгих задач
- ❌ No queue infrastructure для retry/DLQ

#### Feature Status (из аудита)

| Feature | Status | Risk Level | Priority |
|---------|--------|------------|----------|
| Telegram ingestion | Partial (70%) | 🟡 Medium | Wave 0 |
| Multi-tenant isolation | Partial (60%) | 🔴 High | Wave 0 |
| Participant CRM | Partial (65%) | 🟡 Medium | Wave 1 |
| Payments | Missing (0%) | 🔴 Critical | Wave 1 |
| Events & QR | Partial (75%) | 🟢 Low | Wave 1 |
| Analytics | Partial (50%) | 🟡 Medium | Wave 1 |
| Marketplace | Missing (0%) | 🟢 Low | Wave 2 |
| Observability | Missing (5%) | 🔴 Critical | Wave 0 |

#### Критические проблемы (6 шт.)

1. **Service-role security gaps** 🔴
   - **Проблема**: `createAdminServer()` используется повсеместно, bypass RLS
   - **Риск**: Cross-tenant data leakage
   - **Решение**: Scoped RPC wrappers + audit log

2. **Webhook resilience** 🔴
   - **Проблема**: Нет idempotency после удаления `telegram_updates`, нет rate limits
   - **Риск**: Duplicate events, Telegram ban
   - **Решение**: Restore idempotency table, add backoff

3. **Отсутствие observability** 🔴
   - **Проблема**: Console logs only, no structured logging, no metrics
   - **Риск**: Production incidents undetected
   - **Решение**: Pino + Sentry + log drain

4. **Admin verification missing** 🟡
   - **Проблема**: Manual group mapping, no admin rights check
   - **Риск**: Silent disconnects
   - **Решение**: Admin rights verification + health monitor

5. **No payments infrastructure** 🔴
   - **Проблема**: Revenue capture blocked
   - **Риск**: Business growth impossible
   - **Решение**: YooKassa integration + billing tables

6. **QR tokens security** 🟡
   - **Проблема**: Stored plain text, no TTL
   - **Риск**: Brute-force attacks
   - **Решение**: Hash tokens + TTL enforcement

---

### 2. Gap-Analysis.md — Разрыв между стратегией и реализацией

#### Alignment Score Card

| Domain | Strategic Expectation | Current Reality | Gap Score | Priority |
|--------|----------------------|-----------------|-----------|----------|
| **S1: Telegram-first** | Guided onboarding, auto verification, live analytics | Manual mapping, no verification, basic heuristics | 60% gap | Wave 0 |
| **S1: Payments** | YooKassa/Tinkoff, auto reconcile, status sync | Nothing implemented | **100% gap** | Wave 1 |
| **S1: Events & QR** | Full funnel + analytics | CRUD works, analytics manual | 30% gap | Wave 1 |
| **S1: Retention** | DAU/WAU, churn alerts, cohort exports | 14-day chart, heuristics only | 50% gap | Wave 1 |
| **S2: Corporate** | Granular permissions, offboarding, audit | Roles limited, no offboarding, no audit | **90% gap** | Wave 2 |
| **S2: Access Lifecycle** | Auto offboarding, session management | Admin sync only | 70% gap | Wave 2 |
| **S3: Marketplace** | Internal modules + extension API | Nothing | **100% gap** | Wave 2 |
| **S3: Extensibility** | Webhook bus, permission grants | Monolithic processing | **100% gap** | Wave 2 |

#### User Flow Assessment

**Owner/Admin (текущий опыт):**
1. ✅ Create organization → works
2. ⚠️ Connect Telegram → slow, no warnings if bot loses admin
3. ⚠️ Manage members → renewal/billing absent
4. ✅ Launch events → works
5. ⚠️ Monitor health → no DAU/WAU baseline
6. ❌ Setup payments → impossible
7. ❌ Install extensions → not available

**Participant (текущий опыт):**
1. ✅ Join via Telegram → works
2. ⚠️ Access portal → read-only, no personalization
3. ✅ Register for events → works
4. ⚠️ Manage profile → limited

**Corporate Admin (целевой пилот):**
1. ❌ Provision teams → cannot assign granular scopes
2. ❌ Offboard user → manual only
3. ❌ Audit actions → no log
4. ❌ Escalations → no alerting

**Вывод**: Corporate features полностью missing, S1 features частично работают.

---

### 3. Roadmap2.md — 12-недельный план

#### RICE Prioritization (Top-3)

| Epic | Reach | Impact | Confidence | Effort | RICE Score |
|------|-------|--------|------------|--------|------------|
| 1. Telegram Health & Verification | 220 | 4 | 0.7 | 6 | **102** ⭐ |
| 2. Observability & CI | 220 | 3 | 0.65 | 6 | **71** |
| 3. Tenant Guardrails & Audit | 180 | 4 | 0.6 | 7 | **62** |

**Оценка приоритизации**: ✅ Correct
- Top-3 все из Wave 0 (stabilization)
- Payments (RICE=32) правильно в Wave 1, не раньше
- Marketplace (RICE=13) правильно отложен на Wave 2

#### Wave 0 — Stabilization (Weeks 1-2) 🔥

**Goal**: Prevent incidents, ensure tenant safety

| Task | DoD | Risk | Mitigation |
|------|-----|------|------------|
| Telegram Health | Webhook idempotency table, admin rights check via `getChatMember`, health widget in UI, `telegram_health_events` table | Telegram rate limits | Exponential backoff, dry-run staging |
| Observability | Pino logger, Sentry (server+client), unit test placeholder in CI, healthcheck metrics | Log noise | Sampling + PII redaction |
| Tenant Guardrails | Replace service-role with scoped RPC, `admin_action_log` table, static analysis | Perf regressions | Cache org-scoped queries, add indexes |

**Оценка**: ✅ Critical and achievable
- **Effort**: 3 tasks × 6 points = 18 points ≈ 3 engineer-weeks
- **Timeline**: 2 weeks feasible with 1.5 engineers
- **Dependencies**: None, can start immediately

#### Wave 1 — MVP-fit (Weeks 3-8) 💰

**Goal**: Enable monetization and retention

| Task | DoD | Priority |
|------|-----|----------|
| Renewal Engine | Membership status model, reminder worker, UI badges, integration test | High |
| Payments (YooKassa) | Checkout link generation, signed webhook handler, ledger table, runbook | **Critical** |
| Event Attendance | Materialized view, dashboard widget, CSV export, QR token hashing | Medium |
| Observability v2 | Log drain to BigQuery, alert thresholds, triage runbooks | Medium |

**Оценка**: ⚠️ Ambitious but feasible
- **Effort**: 4 tasks × 6-8 points = ~28 points ≈ 5.5 engineer-weeks
- **Timeline**: 6 weeks с 1 engineer
- **Dependencies**: Wave 0 must complete first
- **Risk**: Payment provider onboarding может затянуться → start legal early

#### Wave 2 — Growth Hooks (Weeks 9-12) 🚀

**Goal**: Enable ecosystem and corporate pilots

| Task | Priority |
|------|----------|
| Referral Hooks & Churn Alerts | Medium |
| Corporate Offboarding & Escalations | High (for corp pilots) |
| Marketplace Skeleton + Internal Modules | Medium |

**Оценка**: ⚠️ Depends heavily on Wave 0-1
- **Risk**: Если Wave 0-1 затянутся, Wave 2 impossible в 12 недель
- **Recommendation**: Рассматривать Wave 2 как "Nice to have" в Q1, не blocker

---

### 4. Сравнение с prd.md (оригинальный PRD)

#### Что реализовано из PRD

| Feature from PRD | Status | Coverage |
|------------------|--------|----------|
| Telegram bot integration | ✅ Implemented | 80% |
| Participant profiles | ✅ Implemented | 70% |
| Materials (tree structure) | ✅ Implemented | 90% |
| Events + QR check-in | ✅ Implemented | 85% |
| Dashboard (basic stats) | ✅ Implemented | 60% |
| Multi-tenancy (orgs) | ✅ Implemented | 75% |
| Supabase RLS | ✅ Implemented | 70% |

**Оценка MVP completion**: 75% из original PRD реализовано ✅

#### Что НЕ реализовано из PRD

| Feature from PRD | Status | Impact |
|------------------|--------|--------|
| Billing/payments | ❌ Missing | Critical |
| Freemium limits enforcement | ⚠️ Partial | Medium |
| Telegram Login Widget | ❌ Missing | Low (DM auth works) |
| Deep analytics | ⚠️ Basic | Medium |

#### Gap между PRD и новыми документами

**PRD фокусировался на**: MVP for communities (S1 basic)

**Новые документы добавляют**:
- S2: Corporate layer (granular permissions, offboarding, audit)
- S3: Marketplace (extensions, event bus, SDK)
- Observability & Operations (Pino, Sentry, CI, monitoring)
- Security hardening (tenant guardrails, scoped RPCs)

**Вывод**: Новые документы — это **evolution от MVP к Product-Market Fit**, правильное направление.

---

## 🎯 Стратегические рекомендации

### Краткосрочные (0-2 недели) — Wave 0 ⚡

**Приоритет: КРИТИЧЕСКИЙ**

#### 1. Telegram Healthchecks & Admin Verification

**Зачем**: Предотвратить silent disconnects, которые убивают trust пользователей

**Что делать**:
- ✅ Восстановить idempotency table с `update_id` (была удалена в migration 42)
- ✅ Добавить `getChatMember` check перед mapping группы
- ✅ Создать `telegram_health_events` таблицу для логирования ошибок
- ✅ Health widget в `/settings` showing last sync + errors
- ✅ Cron endpoint для healthcheck каждые 10 минут

**Усилие**: 6 points (1 неделя, 1 engineer)

**Риски**:
- Telegram rate limits → mitigate с exponential backoff
- Supabase function costs → monitor usage

#### 2. Observability Baseline

**Зачем**: Видеть production incidents до того, как пользователи уйдут

**Что делать**:
- ✅ Заменить `console.*` на `pino` (structured logger)
- ✅ Integrate Sentry (server + client) с PII scrubbing
- ✅ Add `pnpm test` placeholder в CI (GitHub Actions)
- ✅ Healthcheck endpoint с uptime metrics

**Усилие**: 6 points (1 неделя, 1 engineer)

**Риски**:
- Log noise → add sampling
- PII leakage → redact carefully

#### 3. Tenant Guardrails & Audit Log

**Зачем**: Защитить от cross-tenant data leakage перед corp pilots

**Что делать**:
- ✅ Audit все `createAdminServer()` usage
- ✅ Создать scoped RPC wrappers (e.g., `get_org_participants_rpc`)
- ✅ Добавить `admin_action_log` таблицу
- ✅ Static analysis rule блокирующий service-role в client components

**Усилие**: 7 points (1.5 недели, 1 engineer)

**Риски**:
- Performance regressions → cache queries, add indexes
- Breaking changes → test thoroughly

**Total Wave 0**: 19 points ≈ 3.5 недели → **feasible в 2 недели с 2 engineers** ✅

---

### Среднесрочные (2-8 недель) — Wave 1 💰

**Приоритет: ВЫСОКИЙ (monetization unlocked)**

#### 4. Payments Integration (YooKassa)

**Зачем**: Unlock revenue, enable paid plans

**Что делать**:
- ✅ Схема БД: `subscriptions`, `invoices`, `payment_events`
- ✅ Checkout link generation endpoint
- ✅ Signed webhook handler (idempotent, retry-safe)
- ✅ Map payments → memberships
- ✅ Runbook для keys & test cards

**Усилие**: 10 points (2 недели, 1 engineer)

**Риски**:
- Provider onboarding delays → **start legal early**
- Webhook retries → add DLQ
- Security review → align with fintech best practices

**Revenue impact**: 🚀 High — enables paid conversion

#### 5. Participant Renewal Engine

**Зачем**: Automate membership lifecycle, reduce churn

**Что делать**:
- ✅ Membership status model (`active`, `expiring`, `expired`)
- ✅ Reminder schedule (email + Telegram)
- ✅ Worker endpoint (cron-triggered)
- ✅ UI badges для overdue renewals
- ✅ Integration test

**Усилие**: 8 points (1.5 недели, 1 engineer)

**Риски**:
- Messaging fatigue → allow snooze
- Inaccurate statuses → manual override capability

#### 6. Event Attendance Insights

**Зачем**: Turn attendance data into actionable insights

**Что делать**:
- ✅ Materialized view для attendance vs invites
- ✅ Dashboard widget (attendance %, no-shows)
- ✅ CSV export
- ✅ QR tokens hashing + TTL enforcement

**Усилие**: 6 points (1 неделя, 1 engineer)

**Total Wave 1**: 24 points ≈ 5 недель → **feasible в 6 недель с 1 engineer** ✅

---

### Долгосрочные (8-12 недель) — Wave 2 🚀

**Приоритет: СРЕДНИЙ (growth unlocked)**

#### 7. Referral Hooks & Churn Alerts

**Зачем**: Drive organic growth, retain members

**Что делать**:
- Admin referral links с attribution
- Churn alert heuristics → Telegram/email notifications
- Silent cohort list export
- Success metrics dashboard

**Усилие**: 7 points

#### 8. Corporate Offboarding & Escalations

**Зачем**: Enable corp pilots (35 teams в target)

**Что делать**:
- Role scopes (viewer/editor)
- Offboarding checklist
- Auto revoke Telegram admin via bot
- Escalation alert config
- Audit log surfaced в UI

**Усилие**: 6 points

#### 9. Marketplace Skeleton + Internal Modules

**Зачем**: Enable extension ecosystem

**Что делать**:
- Tables: `extensions`, `extension_installations`, permission grants
- Extension SDK (webhook/event bus contract)
- Internal modules: Daily Digest, Conflict Signals, Request Board
- API keys per extension с scoped permissions

**Усилие**: 12 points

**Total Wave 2**: 25 points ≈ 5 недель → **tight но feasible** ⚠️

---

## ❓ Вопросы для обсуждения приоритетов

### 1. Стратегия и Timeline

**Q1.1**: Согласен ли ты с приоритетом **Wave 0 → Wave 1 → Wave 2**?  
- Альтернатива: Wave 0 + Payments сразу (Wave 1 payments раньше renewal)
- Trade-off: Быстрее revenue vs риск technical debt

**Q1.2**: Какой **realistic timeline** ты видишь?
- Оценка в Roadmap2: 12 недель (3 месяца)
- Моя оценка с учетом рисков: **14-16 недель** (3.5-4 месяца)
- Твои ресурсы: сколько engineers доступно full-time?

**Q1.3**: Можем ли мы **разбить Wave 1 на части**?
- Wave 1a (недели 3-5): Payments only
- Wave 1b (недели 6-8): Renewal + Attendance insights
- Benefit: Раньше unlock revenue

### 2. Payments и Monetization

**Q2.1**: Какой **payment provider** приоритетен?
- Roadmap mentions: YooKassa / Tinkoff
- Question: Один или оба? Legal готов?

**Q2.2**: Какие **billing plans** запускаем в Wave 1?
- Freemium (есть сейчас, но limits не enforced)
- Pro (3,000 ₽/мес из PRD?)
- Enterprise (custom pricing для corp pilots?)

**Q2.3**: Как будем считать **usage limits**?
- PRD: 50 participants, 1 Telegram group, 1 GB storage
- Enforcement: Hard limit или grace period?
- Upgrade flow: Self-service или sales-assisted?

### 3. Corporate Features (S2)

**Q3.1**: Есть ли **confirmed pilots** для S2?
- Gap-Analysis mentions: 35 pilot corp teams
- Timeline для pilots: когда хотят start?

**Q3.2**: Какие **corp features** must-have для pilots?
- Audit log? Granular permissions? Offboarding automation?
- Can we postpone some to Wave 3?

**Q3.3**: **Compliance requirements**?
- Security&Compliance.md не найден — есть ли compliance checklist?
- GDPR, data residency, etc.?

### 4. Marketplace и Extensibility (S3)

**Q4.1**: Marketplace — это **internal hypothesis** или есть **external demand**?
- If internal: можем postpone до Wave 3-4
- If partners waiting: нужен раньше

**Q4.2**: Какие **internal modules** приоритетны?
- Roadmap: Daily Digest, Conflict Signals, Request Board
- All 3 в Wave 2 или можем выбрать 1-2?

**Q4.3**: External extensions — когда планируем **open to partners**?
- Wave 2 только skeleton + internal
- Wave 3+ для external partners?

### 5. Ресурсы и Execution

**Q5.1**: Сколько **engineering capacity** доступно?
- Full-time engineers: ?
- Part-time / contractors: ?
- Моя оценка: нужно 1.5-2 FTE для 12-week roadmap

**Q5.2**: Нужна ли **design/UX помощь**?
- Audit mentions: Admin onboarding UX нужен wizard
- Corporate dashboard для pilots
- Marketplace UI

**Q5.3**: **QA/Testing strategy**?
- Roadmap mentions: Playwright smoke tests (Wave 0), Vitest (Wave 1), contract tests (Wave 2)
- Automated vs manual testing split?

### 6. Operations и Observability

**Q6.1**: Какие **metrics** критичны для мониторинга?
- Business: Active orgs, DAU, revenue
- Technical: Webhook success rate, API latency, error rate
- Product: Onboarding completion, event attendance rate

**Q6.2**: **Alerting thresholds**?
- Когда считаем incident: webhook failure >5min? >10min?
- Who's on-call?

**Q6.3**: **Log retention и costs**?
- Supabase log drain → BigQuery: сколько ready платить?
- Sentry events: какой tier?

### 7. Technical Debt

**Q7.1**: После Wave 0, какой **priority** у technical debt?
- Service-role usage cleanup → Wave 0
- Database schema normalization?
- Migration consolidation (73 migrations сейчас)?

**Q7.2**: Должны ли мы **refactor EventProcessingService** в Wave 1?
- Сейчас ~1500 lines, monolithic
- Split на smaller services?

### 8. User Research и Validation

**Q8.1**: Как будем **validate** Wave 1 features до full release?
- Beta testing группа?
- A/B testing для pricing?

**Q8.2**: **Feedback loop** для corp pilots?
- Weekly check-ins?
- Dedicated support channel?

---

## 🎯 Моё итоговое предложение

### Рекомендуемый план (с корректировками)

#### Phase 0: Immediate Stabilization (2 недели)
**Start:** Сейчас  
**Goal:** Production-ready foundation

✅ **Do:**
1. Telegram healthchecks + admin verification
2. Observability baseline (Pino + Sentry)
3. Tenant guardrails (scoped RPCs)

❌ **Don't:**
- New features
- Marketplace work
- Corporate features

**Success criteria:**
- Zero silent Telegram disconnects
- All incidents visible в Sentry
- No cross-tenant leakage in tests

---

#### Phase 1a: Payments Unlock (3 недели)
**Start:** Week 3  
**Goal:** Enable monetization

✅ **Do:**
1. YooKassa integration (checkout + webhook)
2. Billing tables + subscription model
3. Payment reconciliation logic
4. Upgrade flow UI

❌ **Don't:**
- Renewal automation yet (do manual first)
- Multiple providers (pick one)

**Success criteria:**
- First paid subscription captured
- Webhook reconcile tested with 100 transactions
- Runbook documented

---

#### Phase 1b: Retention Automation (3 недели)
**Start:** Week 6  
**Goal:** Reduce churn

✅ **Do:**
1. Renewal engine (automated reminders)
2. Event attendance insights
3. QR token security (hashing + TTL)
4. Churn alert automation

**Success criteria:**
- Renewal reminders sent successfully
- Attendance dashboard shows real data
- QR brute-force prevented

---

#### Phase 2: Corp Pilots Prep (4 недели)
**Start:** Week 9  
**Goal:** Enable 5-10 corp pilots

✅ **Do:**
1. Granular permissions (viewer/editor)
2. Offboarding automation
3. Audit log UI
4. Escalation alerts

⚠️ **Defer to Phase 3:**
- Marketplace (unless pilots demand)
- Referral system (do manual first)

**Success criteria:**
- 5 corp pilots onboarded
- Audit log captures all admin actions
- Offboarding tested end-to-end

---

#### Phase 3: Growth & Ecosystem (6+ недель)
**Start:** Week 13  
**Goal:** Scale and extend

✅ **Do:**
1. Marketplace scaffold
2. First internal module (Daily Digest)
3. Referral mechanics
4. Advanced analytics

---

### Adjusted Timeline

```
Week 1-2:   Wave 0 (Stabilization)           ███████
Week 3-5:   Phase 1a (Payments)              ██████
Week 6-8:   Phase 1b (Retention)             ██████
Week 9-12:  Phase 2 (Corp Pilots Prep)       ████████
Week 13+:   Phase 3 (Growth & Ecosystem)     ██████...
```

**Total:** 12 недель до corp pilots, 16+ недель до full marketplace

---

## 📋 Next Steps

### Немедленные действия (эта неделя):

1. **Decision call** по вопросам 1-8
2. **Resource allocation** — подтвердить engineering capacity
3. **Payment provider** — start legal/compliance review для YooKassa
4. **Wave 0 kickoff** — apply migrations 073-074, start Telegram health task

### Документация:

1. Создать **decision log** с answers на вопросы
2. Обновить **Roadmap2.md** с adjusted timeline
3. Создать **Wave 0 sprint plan** (issues, tasks, DoD)

### Monitoring:

1. **Weekly sync** для tracking progress
2. **Bi-weekly** demo для stakeholders
3. **Monthly** retrospective для process improvement

---

## 💡 Финальная мысль

**Текущий код** — это solid MVP (75% original PRD).  
**Новые документы** — ambitious но achievable roadmap к PMF.  
**Критический успех**: **Не skip Wave 0**. Stabilization сейчас сэкономит месяцы debugging потом.

**Вопрос фокуса**: Лучше 100% execution на Wave 0-1 (8 недель), чем 60% execution на всех трех waves (12 недель).

---

**Готов к обсуждению приоритетов!** 🚀



