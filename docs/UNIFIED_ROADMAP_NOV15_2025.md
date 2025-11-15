# 🎯 UNIFIED ROADMAP — Orbo Product Development
**Дата:** 15 ноября 2025  
**Статус:** Актуальный единый план  
**Horizon:** 16 недель (4 месяца)  
**Контекст:** Solo-founder, реальные запросы клиентов, Jobs to be Done из кастдевов

---

## 📊 ЧТО УЖЕ СДЕЛАНО (Status Check)

### ✅ CORE PLATFORM (MVP Complete)
- [x] Авторизация (email + Telegram magic codes)
- [x] Мультиорганизационность (memberships, роли)
- [x] Telegram интеграция (2 бота, webhook, импорт участников)
- [x] Участники (профили, дубликаты, слияние, теневые профили)
- [x] База знаний (Materials - иерархические страницы, Markdown)
- [x] События (создание, регистрация, ICS, публичные страницы)
- [x] События - напоминания за 24ч (cron job)
- [x] Аналитика (dashboard, group metrics, activity tracking)
- [x] Роли и права (owner/admin/member/guest + shadow profiles)

### ✅ RECENT ACHIEVEMENTS (November 2025)
- [x] **Orbo Apps** - AI Constructor для создания приложений (доски объявлений, заявки, события)
- [x] **Public UX** - публичные страницы событий без авторизации
- [x] **Telegram Auth** - 6-значные коды для быстрой авторизации
- [x] **AdminMode Toggle** - переключение между режимами админа и участника
- [x] **URL Migration** - переход с `/app/[org]` на `/p/[org]` структуру
- [x] **Event Reminders** - автоматические DM за 24 часа до события
- [x] **"Powered by Orbo"** - брендинг на публичных страницах

---

## 🎯 JOBS TO BE DONE (из кастдевов)

### Приоритизация по частоте упоминаний:

| JTBD | Статус | Приоритет | Текущее решение |
|------|--------|-----------|------------------|
| **Активные участники создают контент** | ✅ DONE | P0 | Orbo Apps (AI Constructor) |
| **Календарь событий + автопубликация** | 🟡 PARTIAL | P0 | События есть, нужна автопубликация |
| **Долгое хранение материалов** | 🟡 PARTIAL | P1 | Materials есть, нужно улучшить |
| **Многослойность доступа** | 🟡 PARTIAL | P1 | Роли есть, нужны гранулярные права |
| **Омниканальность** | 🟡 PARTIAL | P1 | Telegram есть, нужны email/SMS |
| **Рекомендации по ведению сообществ** | ❌ TODO | P2 | Нет, можно добавить |
| **Надежность и устойчивость** | 🟡 ONGOING | P0 | Мониторинг, health checks |
| **Хранение данных в РФ + реестры** | ⚠️ CHECK | P1 | Supabase EU, нужен анализ |

**Легенда:**  
✅ DONE - реализовано  
🟡 PARTIAL - частично реализовано  
❌ TODO - не начато  
⚠️ CHECK - требует проверки  

---

## 🗓️ UNIFIED PLAN (16 недель)

### 🚀 ТЕКУЩАЯ НЕДЕЛЯ (15-21 ноября)

#### **Приоритет 1: Главная страница для участников** ✨
**Цель:** Участник открывает `/p/[org]` и сразу видит ценность

**Фаза 1 - MVP (3-4 дня):**
- [ ] Hero-секция с названием организации
- [ ] Предстоящие события (3 ближайших) с кнопками регистрации
- [ ] Быстрые ссылки (Профиль, События, Материалы, Группы)
- [ ] Новые участники (5 последних с аватарами)

**Фаза 2 - Персонализация (3-4 дня):**
- [ ] Приветственный блок: "Привет, {Имя}! Ты в сообществе {N} дней"
- [ ] Мои события (на которые зарегистрирован)
- [ ] Рекомендации для новичков (< 7 дней)
- [ ] "Что ты пропустил" для пассивных (> 14 дней не заходил)

**API endpoints:**
- `GET /api/participants/me` - текущий участник + stats
- `GET /api/participants?org_id=X&limit=5&sort=recent` - новые участники

---

### 📅 WEEKS 1-2: Stabilization + Home Page (15-28 ноября)

#### **A. Главная страница** (из плана выше) 
**Effort:** 6-8 дней  
**Owner:** You + AI

#### **B. Техническая стабильность** (параллельно)
**Задачи:**
- [ ] Telegram webhook health monitor (видеть статус в UI)
- [ ] Basic error logging page (без external services)
- [ ] Проверка прав админа перед mapping
- [ ] QR token security (hash + TTL)

**Effort:** 3-4 дня  
**Owner:** You + AI  
**DoD:** 
- Zero webhook failures >10min undetected
- Errors visible in simple dashboard
- QR tokens secure from replay attacks

---

### 📅 WEEKS 3-4: Content Creation by Members (29 ноя - 12 дек)

#### **Цель:** Реализовать JTBD "Активные участники создают контент"

**A. Улучшения Orbo Apps для участников:**
- [ ] Public app gallery (участник видит доступные приложения)
- [ ] Member permissions (кто может создавать: все/только админы/модераторы)
- [ ] Content moderation queue (админ одобряет перед публикацией)
- [ ] Notifications (участнику: "Твой пост опубликован/отклонен")

**B. Публикация в Telegram группы:**
- [ ] Auto-post новых объявлений в группу (optional toggle)
- [ ] Deep links: `t.me/bot?start=item_{itemId}`
- [ ] Share buttons на карточках

**C. UGC (User-Generated Content) для материалов:**
- [ ] Участники могут предлагать материалы (draft status)
- [ ] Админ review + publish flow
- [ ] Comments на материалах (v1: simple)

**Effort:** 8-10 дней  
**DoD:**
- 5+ участников создали контент через Orbo Apps
- Автопубликация в Telegram работает
- Модерация работает без багов

---

### 📅 WEEKS 5-6: Event Automation + Calendar (13-26 декабря)

#### **Цель:** Реализовать JTBD "Календарь событий с автопубликацией"

**A. Event Automation:**
- [ ] Auto-publish события по расписанию (draft → published)
- [ ] Bulk event creation (CSV import)
- [ ] Recurring events (еженедельные, ежемесячные)
- [ ] Event templates (шаблоны для повторяющихся событий)

**B. Calendar View:**
- [ ] Календарный вид (месяц/неделя) для событий
- [ ] Фильтры по категориям/тегам
- [ ] Export календаря (iCal subscription link)
- [ ] Google Calendar integration (one-way sync)

**C. Advanced Notifications:**
- [ ] Customizable reminder times (3 days, 1 day, 1 hour)
- [ ] SMS reminders (via API, optional)
- [ ] Email digests (weekly upcoming events)

**Effort:** 8-10 дней  
**DoD:**
- События автопубликуются по расписанию
- Календарный вид работает на mobile
- Подписка на календарь работает в Google Calendar

---

### 📅 WEEKS 7-8: Access Control + Storage (27 дек - 9 янв)

#### **Цель:** Реализовать JTBD "Многослойность доступа" + "Хранение материалов"

**A. Granular Permissions:**
- [ ] Custom roles (кроме owner/admin/member)
- [ ] Permission sets (view_events, create_materials, moderate_apps)
- [ ] Resource-level permissions (доступ к конкретным материалам/событиям)
- [ ] Admin UI для управления ролями

**B. Content Access Tiers:**
- [ ] Free tier (public content)
- [ ] Member tier (requires Telegram group membership)
- [ ] Premium tier (paid subscriptions)
- [ ] Time-limited access (материал доступен N дней после присоединения)

**C. Storage & Archive:**
- [ ] File upload limits per tier (Free: 100MB, Pro: 10GB)
- [ ] Video storage (Supabase Storage + CDN)
- [ ] Automatic archiving (события старше 1 года → archive)
- [ ] Export archive (org owner может скачать всё)

**D. Compliance Check:**
- [ ] Проверка: где физически хранятся данные Supabase
- [ ] Документация для клиентов (где данные, GDPR)
- [ ] Backup strategy (автоматические бэкапы)

**Effort:** 8-10 дней  
**DoD:**
- Granular permissions работают
- Разные тарифы доступа реализованы
- Видео загружаются и воспроизводятся
- Документация по compliance готова

---

### 📅 WEEKS 9-10: Omnichannel Communication (10-23 января)

#### **Цель:** Реализовать JTBD "Омниканальность"

**A. Email Integration (Mailgun):**
- [ ] Transactional emails (welcome, event reminders, digests)
- [ ] Email templates (красивый дизайн)
- [ ] Unsubscribe flow (GDPR compliant)
- [ ] Email analytics (open rate, click rate)

**B. SMS Integration (optional, via provider):**
- [ ] SMS reminders для важных событий
- [ ] SMS verification (альтернатива Telegram)
- [ ] Cost tracking (SMS дорогие, нужен мониторинг)

**C. Push Notifications (future):**
- [ ] Research: PWA push notifications
- [ ] Prototype для критических уведомлений

**D. Unified Notification Center:**
- [ ] User preferences: email vs Telegram vs SMS
- [ ] Notification history (что было отправлено)
- [ ] Batch scheduling (не спамить участников)

**Effort:** 8-10 дней  
**DoD:**
- Email notifications работают и выглядят красиво
- SMS прототип протестирован (опционально)
- Участник может выбрать канал уведомлений

---

### 📅 WEEKS 11-12: Community Growth Tools (24 янв - 6 фев)

#### **Цель:** Реализовать JTBD "Рекомендации по ведению сообществ"

**A. Community Health Dashboard:**
- [ ] Engagement score (DAU/MAU, retention)
- [ ] Churn risk indicators (кто давно не активен)
- [ ] Growth metrics (new members, retention curves)
- [ ] Benchmarks (сравнение с другими сообществами)

**B. AI-Powered Insights:**
- [ ] Weekly insights для админа (OpenAI API)
- [ ] "Your community is doing great/needs attention"
- [ ] Actionable recommendations ("Post more events", "Engage silent members")
- [ ] Content suggestions (trending topics)

**C. Best Practices Library:**
- [ ] In-app tips for admins (onboarding checklist)
- [ ] Templates (welcome messages, event descriptions)
- [ ] Case studies (successful communities)
- [ ] Video tutorials (how to use features)

**D. Community Playbooks:**
- [ ] Onboarding playbook (first 7 days)
- [ ] Engagement playbook (re-activate passive members)
- [ ] Event playbook (planning, promotion, follow-up)

**Effort:** 8-10 дней  
**DoD:**
- Dashboard показывает health score
- AI insights генерируются еженедельно
- Library доступна в админке
- Playbooks tested with 3+ orgs

---

### 📅 WEEKS 13-14: Payments & Subscriptions (7-20 февраля)

#### **Цель:** Монетизация для клиентов

**A. Manual Payment Tracking:**
- [ ] Subscription schema (plans, payments, methods)
- [ ] Admin UI для создания подписок
- [ ] Manual payment confirmation
- [ ] Membership status sync (payment → access)

**B. Prodamus Integration Prep:**
- [ ] API research, sandbox testing
- [ ] Checkout link generation
- [ ] Webhook handler (stub)
- [ ] Payment reconciliation

**C. Subscription Features:**
- [ ] Recurring billing (ежемесячно, ежегодно)
- [ ] Trial periods (7 days free)
- [ ] Upgrade/downgrade flow
- [ ] Invoice generation (PDF)

**Effort:** 8-10 дней  
**DoD:**
- Admin может создать subscription
- Participant может оплатить manual/Prodamus
- Membership status обновляется автоматически
- Invoice генерируется

---

### 📅 WEEKS 15-16: Analytics & Marketplace Prep (21 фев - 6 марта)

#### **A. Advanced Analytics (Wave 0.2 из REVISED_ROADMAP):**
- [ ] Group Analytics Dashboard (activity timeline, top contributors)
- [ ] Message import (JSON → enrichment)
- [ ] Participant profile enrichment (topics, connectors)
- [ ] Event attendance insights (no-show rates)

**B. Marketplace Foundation (Wave 1b из REVISED_ROADMAP):**
- [ ] Extension schema (extensions, installations, permissions)
- [ ] API keys per extension
- [ ] Webhook routing to extensions
- [ ] Marketplace UI (browse, install, configure)

**C. Internal Modules:**
- [ ] Daily Digest Module (cron → summary via email/Telegram)
- [ ] Conflict Signals Module (sentiment drops, heated threads)

**Effort:** 10-12 дней  
**DoD:**
- Analytics dashboard показывает wow-effect
- Marketplace UI live
- 2+ internal modules working

---

## 📋 BACKLOG (Post Week 16)

### High Priority (Wave 3):
- [ ] Mobile app (React Native)
- [ ] White-label branding
- [ ] SSO integration
- [ ] Advanced gamification (badges, leaderboards)
- [ ] API для разработчиков (public REST API)

### Medium Priority:
- [ ] AR/VR elements (virtual tours)
- [ ] Blockchain/NFT achievements
- [ ] Voice assistant integration
- [ ] Multi-language support

### Low Priority:
- [ ] Custom themes per org
- [ ] Advanced reporting (custom dashboards)
- [ ] Integrations marketplace (Zapier, etc.)

---

## 🎯 PRIORITIZATION FRAMEWORK

### Для каждой новой задачи:

1. **Реальный запрос клиента?** → P0 (делаем сразу)
2. **Из Jobs to be Done?** → P1 (в roadmap)
3. **Wow-effect для onboarding?** → P1 (высокая ценность)
4. **Unlocks revenue?** → P1 (монетизация)
5. **Prevents churn?** → P2 (reliability)
6. **Nice-to-have?** → Backlog

**Rule:** 70% customer requests + 20% wow-effect + 10% tech debt

---

## 🎨 DESIGN PRIORITIES

### Must-Have UX:
- **Mobile-first** (80% Telegram users on mobile)
- **< 2s load time** (initial page load)
- **< 5 minutes** to first value (signup → first action)
- **Clear CTAs** (what to do next)
- **Beautiful empty states** (not discouraging)

### Design System:
- TailwindCSS (already using)
- Consistent spacing/colors
- Accessible (WCAG AA)
- Dark mode support (future)

---

## 📊 SUCCESS METRICS

### Weekly Check-ins:
- [ ] Velocity (planned vs actual points)
- [ ] Blockers surfaced
- [ ] Customer feedback collected

### Monthly Metrics:
- **Engagement:** DAU/MAU, session duration
- **Retention:** D7, D30 retention rates
- **Growth:** New orgs, active orgs
- **Revenue:** MRR, churn rate
- **Quality:** Bug count, performance scores

### North Star Metric:
**Weekly Active Communities** (orgs with ≥5 active members)

---

## ⚠️ RISKS & MITIGATIONS

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Solo burnout | Medium | High | Strict 4h/day, buffer weeks |
| Customer churn | Medium | High | Weekly check-ins, fast iteration |
| Supabase location | Low | High | Research EU compliance, backup plan |
| Prodamus delays | Low | Medium | Start with manual, iterate |
| Scope creep | High | Medium | Strict prioritization framework |

---

## 🔥 IMMEDIATE NEXT STEPS (This Week)

### Monday-Tuesday (Nov 18-19):
1. **Main Page Фаза 1 (MVP)** - Hero + Events + Quick Links
2. Deploy to staging
3. User testing with 2-3 participants

### Wednesday-Thursday (Nov 20-21):
4. **Main Page Фаза 2 (Персонализация)** - Приветствие + Мои события
5. Analytics API endpoints
6. Deploy to production

### Friday (Nov 22):
7. **Testing & Documentation**
8. User guide for participants
9. Plan for Week 3-4

---

## 📞 WEEKLY SYNC FORMAT

**Every Monday 9:00 AM:**
1. Review last week (velocity, wins, blockers)
2. Plan this week (pick tasks, set goals)
3. Customer feedback review
4. Update roadmap if needed

---

## 💰 COST PROJECTIONS

**Months 1-2:**
- Supabase: Free tier ($0)
- Vercel: Hobby ($0)
- Domain: $10/month
- **Total: ~$10/month**

**Months 3-4:**
- Supabase: Pro ($25/month)
- Vercel: Pro ($20/month)
- Prodamus: Transaction fees (~2.8%)
- Mailgun: $35/month
- **Total: ~$85/month + transaction fees**

---

## ✅ DONE CHECKLIST (Review every 2 weeks)

- [ ] Main Page (Фаза 1+2) launched
- [ ] UGC (participant content) working
- [ ] Event automation live
- [ ] Granular permissions tested
- [ ] Omnichannel notifications sent
- [ ] Community insights generated
- [ ] Payments integrated
- [ ] Analytics dashboard wow-effect
- [ ] Marketplace foundation ready

---

**Last Updated:** November 15, 2025  
**Next Review:** November 29, 2025 (after Week 2)  
**Version:** 1.0

---

## 📝 NOTES

**Alignment with previous roadmaps:**
- ✅ REVISED_ROADMAP_SOLO: Waves 0-1b fully incorporated
- ✅ ROADMAP_NOV10_PUBLIC_FOCUS: Public UX done, improvements ongoing
- ✅ COMPREHENSIVE_PRD: MVP complete, Phase 2-3 in this plan
- ✅ Jobs to be Done: All 8 JTBDs mapped to roadmap items

**Key changes from previous plans:**
- **Главная страница** moved to Week 1 (P0 for user experience)
- **UGC (participant content)** moved up (customer demand)
- **Event automation** prioritized (JTBD: календарь)
- **Marketplace** delayed to Week 15-16 (after customer features)
- **Compliance** added (JTBD: хранение в РФ)
- **Community insights** added (JTBD: рекомендации)

**What's NOT in this roadmap:**
- Геймификация (Фаза 3+4 из MAIN_PAGE_STRATEGY) → Backlog
- AI помощник (Фаза 4) → Backlog (сложная ML-инфраструктура)
- Corporate features → Postponed (no demand yet)
- External partner API (Marketplace) → Wave 2+ (after internal modules)

