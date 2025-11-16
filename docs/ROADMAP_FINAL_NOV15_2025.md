# 🎯 FINAL ROADMAP — Orbo Product Development
**Дата:** 15 ноября 2025  
**Статус:** Утвержден с корректировками  
**Horizon:** 16 недель (4 месяца)  
**Контекст:** Solo-founder, реальные запросы клиентов

---

## ✅ ЧТО УЖЕ СДЕЛАНО

### CORE PLATFORM (MVP Complete)
- [x] Авторизация (email + Telegram magic codes)
- [x] Мультиорганизационность
- [x] Telegram интеграция (2 бота, webhook, импорт)
- [x] Участники (профили, дубликаты, слияние)
- [x] База знаний (Materials - иерархические страницы)
- [x] События (создание, регистрация, ICS, публичные страницы)
- [x] События - напоминания за 24ч (cron job)
- [x] Orbo Apps (AI Constructor, 4 типа приложений)
- [x] Аналитика (dashboard, group metrics)
- [x] AdminMode toggle

---

## 🗓️ УТВЕРЖДЕННЫЙ ПЛАН (16 недель)

### 📅 WEEKS 1-2: Home Page + Testing (15-28 ноября)

#### **A. Главная страница для участников** ✨
**Цель:** Участник сразу видит ценность

**Фаза 1 - MVP (3-4 дня):**
- [ ] Hero-секция с названием организации + описание
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
- `GET /api/participants?org_id=X&limit=5&sort=recent`

**Effort:** 6-8 дней  
**DoD:**
- Home page работает на mobile
- Персонализация отображается корректно
- Загрузка < 2s

---

### 📅 WEEKS 3-4: UGC + Orbo Apps Enhancements (29 ноя - 12 дек)

#### **Цель:** Участники создают контент, админы модерируют

**A. UGC (User-Generated Content):**
- [ ] Public app gallery (участник видит доступные приложения)
- [ ] Member permissions настройки (кто может создавать контент)
- [ ] Content moderation queue для админов
- [ ] Notifications (участнику: "Твой пост опубликован/отклонен")

**B. Публикация в Telegram:**
- [ ] Auto-post новых объявлений в группу (optional toggle)
- [ ] Deep links: `t.me/bot?start=item_{itemId}`
- [ ] Share buttons на карточках

**C. UGC для материалов:**
- [ ] Участники могут предлагать материалы (draft status)
- [ ] Админ review + publish flow
- [ ] Simple comments на материалах

**D. Orbo Apps Enhancements:** 🎨
- [ ] **Кастомизация визуала:**
  - Primary/secondary colors
  - Logo/icon upload
  - Custom CSS (базовый)
- [ ] **Управление отображением:**
  - Порядок полей в форме
  - Скрыть/показать поля
  - Кастомные labels
- [ ] **Новый тип приложения:**
  - **Surveys/Polls** (опросы/голосования)
  - AI Constructor для опросов
  - Results visualization

**Effort:** 10-12 дней  
**DoD:**
- 5+ участников создали контент через Orbo Apps
- Автопубликация в Telegram работает
- Модерация работает без багов
- Визуальная кастомизация применяется
- Опросы создаются и работают

---

### 📅 WEEKS 5-6: Event Automation + Calendar (13-26 декабря)

#### **Цель:** Календарь с автопубликацией

**A. Event Automation:**
- [ ] Auto-publish события по расписанию (draft → published at specific time)
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
- [ ] Email digests (weekly upcoming events)

**Effort:** 8-10 дней  
**DoD:**
- События автопубликуются по расписанию
- Календарный вид работает на mobile
- Подписка на календарь работает в Google Calendar
- CSV import обрабатывает 100+ событий

---

### 📅 WEEKS 7-8: CRM for Participants + Storage (27 дек - 9 янв)

#### **Цель:** CRM-уровень управления участниками + хранение

**A. CRM-доработки раздела Участники:** 📊
- [ ] **Расширенная таблица участников:**
  - Больше колонок (last_active, messages_count, events_attended)
  - Сортировка по любому полю
  - Export to CSV/Excel
  - Column visibility settings (показать/скрыть колонки)
  
- [ ] **Кастомные тэги:**
  - UI для создания тегов (цвет + название)
  - Применение тегов к участникам (bulk action)
  - Фильтр по тегам
  - Тег-автоматизация (правила: "если не активен 14 дней → тег 'риск оттока'")

- [ ] **Детальная история участника:**
  - Timeline всех действий (события, сообщения, регистрации)
  - Activity graph (активность по дням/неделям)
  - Payment history (если платил)
  - Notes section (админ может оставлять заметки)
  - Linked participants (если были дубликаты)

- [ ] **Логи действий:**
  - Audit log для admin actions (кто, когда, что изменил)
  - Filterable log view
  - Export logs

**B. Granular Permissions:**
- [ ] Custom roles (кроме owner/admin/member)
- [ ] Permission sets (view_events, create_materials, moderate_apps)
- [ ] Admin UI для управления ролями

**C. Storage & Archive:**
- [ ] File upload limits per tier (Free: 100MB, Pro: 10GB)
- [ ] Video storage (Supabase Storage + CDN)
- [ ] Automatic archiving (события старше 1 года → archive)
- [ ] Export archive (org owner может скачать всё)

**D. Compliance Check:** ⚠️
- [ ] Проверка: где физически хранятся данные Supabase
- [ ] Документация для клиентов (где данные, GDPR)
- [ ] Backup strategy (автоматические бэкапы)

**Effort:** 10-12 дней  
**DoD:**
- CRM-таблица с 15+ полями и сортировкой
- Тэги работают, фильтры по тегам
- Timeline участника показывает все действия
- Audit log записывает все изменения
- Compliance documentation готова

---

### 📅 WEEKS 9-10: Payments for Events + Membership (10-23 января)

#### **Цель:** Учет оплаты событий и членства

**A. Payment Tracking Foundation:** 💰
- [ ] **Database Schema:**
  - `payments` (id, org_id, participant_id, amount, currency, status, type)
  - `payment_methods` (описание способа оплаты)
  - `subscriptions` (id, org_id, participant_id, plan, status, start_date, end_date)
  - `transactions` (id, payment_id, timestamp, status, metadata)

- [ ] **Event Payments (Priority 1):**
  - Add payment info to event form (price, payment_methods)
  - Registration with payment tracking
  - Admin UI: view registrations with payment status
  - Mark payment as received (manual)
  - Send payment reminder to unpaid registrants
  - Export payments to CSV
  
- [ ] **Membership Payments (Priority 2):**
  - Create subscription plans (Free/Pro/Premium)
  - Assign plan to participant
  - Track payment status (pending/paid/overdue)
  - Auto-update membership status based on payment
  - Renewal reminders (7 days before expiry)

**B. Payment Management UI:**
- [ ] **Admin Dashboard:**
  - List all payments (filterable by status, date, participant)
  - Bulk actions (mark as paid, send reminders)
  - Financial reports (revenue by period, event, plan)
  - Overdue payments alert
  
- [ ] **Participant View:**
  - My payments page
  - Payment history
  - Download invoice (PDF)
  - Payment instructions

**C. Prodamus Integration Prep:**
- [ ] Research Prodamus API
- [ ] Checkout link generation
- [ ] Webhook handler (stub for future)

**Effort:** 10-12 дней  
**DoD:**
- Event payments tracked manually
- Membership subscriptions работают
- Admin видит все транзакции
- Participant видит свои платежи
- Reminders отправляются автоматически
- Export payments to CSV работает

---

### 📅 WEEKS 11-12: Omnichannel + Unisender Go (24 янв - 6 фев)

#### **Цель:** Email/SMS уведомления через Unisender Go

**A. Unisender Go Integration:** 📧
- [ ] API setup (ключи, домен)
- [ ] Email templates (welcome, event reminders, digests)
- [ ] Transactional emails:
  - Welcome email (new participant)
  - Event reminder (1 day before)
  - Payment confirmation
  - Weekly digest
- [ ] Unsubscribe flow (GDPR compliant)
- [ ] Email analytics (open rate, click rate)

**B. SMS Integration (optional):**
- [ ] SMS reminders для важных событий
- [ ] SMS verification (альтернатива Telegram)
- [ ] Cost tracking

**C. Unified Notification Center:**
- [ ] User preferences: email vs Telegram vs SMS
- [ ] Notification history
- [ ] Batch scheduling (не спамить)

**Effort:** 8-10 дней  
**DoD:**
- Unisender Go integration работает
- Email notifications красивые и доставляются
- Participant может выбрать канал уведомлений
- Unsubscribe работает

---

### 📅 WEEKS 13-14: Testing + Code Optimization (7-20 февраля)

#### **Цель:** Стабильность и качество кода

**A. Comprehensive Testing:** 🧪
- [ ] **End-to-End Testing:**
  - User journey: signup → join org → create content → register for event
  - Admin journey: create org → setup → moderate → manage payments
  - Mobile testing (iOS + Android)
  - Cross-browser testing (Chrome, Safari, Firefox)

- [ ] **Performance Testing:**
  - Load time optimization (< 2s target)
  - Database query optimization
  - Image lazy loading
  - Code splitting

**B. Code Quality & Structure:** 🏗️
- [ ] **Refactoring:**
  - Extract common components
  - Remove duplicate code
  - Consistent naming conventions
  - Type safety improvements

- [ ] **Database Optimization:**
  - Index optimization
  - Query performance analysis
  - Unused tables cleanup
  - Migration consolidation

- [ ] **Logging & Monitoring:**
  - Structured logging (Pino)
  - Error tracking (basic dashboard)
  - Performance metrics
  - Telegram webhook health monitor

**C. Documentation:**
- [ ] Code comments for complex logic
- [ ] API documentation (endpoints, params)
- [ ] User guides (participant + admin)
- [ ] Deployment guide

**Effort:** 10-12 дней  
**DoD:**
- 0 critical bugs
- Load time < 2s
- Code coverage > 60%
- All user journeys tested
- Documentation complete

---

### 📅 WEEKS 15-16: Polish + Launch Prep (21 фев - 6 марта)

#### **Цель:** Final polish и подготовка к масштабированию

**A. UI/UX Polish:**
- [ ] Loading states (skeletons, not spinners)
- [ ] Error messages (helpful, actionable)
- [ ] Success feedback (animations)
- [ ] Empty states (beautiful, not discouraging)
- [ ] Mobile UX improvements

**B. Advanced Analytics (if time permits):**
- [ ] Group Analytics Dashboard (activity timeline)
- [ ] Participant engagement metrics
- [ ] Event attendance insights

**C. Marketing Prep:**
- [ ] Demo video recording
- [ ] Case studies (successful communities)
- [ ] Blog post (product announcement)
- [ ] Landing page updates

**D. Infrastructure:**
- [ ] Backup strategy tested
- [ ] Monitoring dashboard
- [ ] Alerting system
- [ ] Scaling plan documented

**Effort:** 10-12 дней  
**DoD:**
- UI polish applied
- Demo video ready
- Monitoring live
- Ready for 100+ orgs

---

## 📋 BACKLOG (Post Week 16)

### High Priority (Wave 3):
- [ ] Marketplace foundation (extensions, API)
- [ ] Community insights (AI-powered)
- [ ] Mobile app (React Native)
- [ ] Advanced gamification

### Medium Priority:
- [ ] White-label branding
- [ ] SSO integration
- [ ] Custom themes per org
- [ ] Advanced reporting

### Low Priority:
- [ ] AR/VR elements
- [ ] Blockchain/NFT achievements
- [ ] Voice assistant
- [ ] Multi-language support

---

## 🎯 ПОКРЫТИЕ JOBS TO BE DONE

| JTBD | Реализация | Недели |
|------|------------|--------|
| ✅ Активные участники создают контент | Week 3-4 | UGC + Apps |
| 📅 Календарь с автопубликацией | Week 5-6 | Event automation |
| 📚 Долгое хранение материалов | Week 7-8 | Storage + Archive |
| 🔐 Многослойность доступа | Week 7-8 | Granular permissions |
| 📧 Омниканальность | Week 11-12 | Unisender Go |
| 💰 Учет платежей | Week 9-10 | Payment tracking |
| 🛡️ Надежность | Week 13-14 | Testing + Monitoring |
| 🇷🇺 Хранение в РФ | Week 7-8 | Compliance check |

**100% покрытие + CRM + Payments!** ✅

---

## 🧪 TESTING SCHEDULE

### Weekly Testing (каждую пятницу):
- [ ] Manual smoke test (critical flows)
- [ ] Performance check (load times)
- [ ] Bug triage
- [ ] Deploy to staging

### Milestone Testing (после каждой 2-недельной фазы):
- [ ] End-to-end testing
- [ ] User acceptance testing (2-3 real users)
- [ ] Performance benchmarks
- [ ] Security audit

---

## 📊 SUCCESS METRICS

### Weekly Check-ins (каждый понедельник):
- [ ] Velocity (planned vs actual)
- [ ] Blockers surfaced
- [ ] Customer feedback

### Monthly Metrics:
- **Engagement:** DAU/MAU, session duration
- **Retention:** D7, D30 retention
- **Growth:** New orgs, active orgs
- **Quality:** Bug count, performance

### North Star Metric:
**Weekly Active Communities** (orgs с ≥5 active members)

---

## 💰 COST PROJECTIONS

**Months 1-2:**
- Supabase: Free tier ($0)
- Vercel: Hobby ($0)
- Unisender Go: $0 (до 1000 emails)
- Domain: $10/month
- **Total: ~$10/month**

**Months 3-4:**
- Supabase: Pro ($25/month)
- Vercel: Pro ($20/month)
- Unisender Go: $35/month
- **Total: ~$80/month**

---

## ⚠️ RISKS & MITIGATIONS

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Solo burnout | Medium | High | Strict 4h/day, buffer weeks |
| Payment bugs | Medium | High | Extensive testing, manual fallback |
| Unisender delays | Low | Medium | Fallback to Telegram notifications |
| Scope creep | High | Medium | Strict prioritization |
| Data loss | Low | High | Daily backups, tested recovery |

---

## 🔥 IMMEDIATE NEXT STEPS (This Week)

### Monday-Tuesday (Nov 18-19):
1. ✅ Main Page Фаза 1 (MVP)
2. Deploy to staging
3. User testing

### Wednesday-Thursday (Nov 20-21):
4. ✅ Main Page Фаза 2 (Персонализация)
5. Analytics API endpoints
6. Deploy to production

### Friday (Nov 22):
7. Testing & Documentation
8. Plan for Week 3-4

---

## 📞 WEEKLY SYNC FORMAT

**Every Monday 9:00 AM:**
1. Review last week (wins, blockers)
2. Plan this week (tasks, goals)
3. Customer feedback review
4. Update roadmap if needed

---

## ✅ DONE CHECKLIST (Review every 2 weeks)

- [ ] Main Page (Фаза 1+2) launched
- [ ] UGC + Orbo Apps enhancements
- [ ] Event automation live
- [ ] CRM для участников
- [ ] Payment tracking работает
- [ ] Omnichannel notifications sent
- [ ] Testing & optimization complete
- [ ] Ready for scale

---

## 📝 KEY CHANGES FROM PREVIOUS ROADMAPS

**Утверждено:**
1. ✅ UGC **раньше** Event Automation (Week 3-4)
2. ✅ CRM для участников **вместо** AI Insights
3. ✅ Payments **приоритет** (Week 9-10)
4. ✅ Orbo Apps enhancements (визуал + новый тип)
5. ✅ Unisender Go **вместо** Mailgun
6. ✅ Testing & Optimization как отдельная фаза (Week 13-14)

**Отложено:**
- ❌ AI-powered Community Insights → Backlog
- ❌ Marketplace foundation → Backlog
- ❌ Advanced Analytics → Backlog (или Week 15-16 if time)

---

**Last Updated:** November 15, 2025  
**Next Review:** November 29, 2025 (after Week 2)  
**Version:** 2.0 (Final)

---

## 🎓 ORBO APPS: Planned Types

**Current (Implemented):**
1. ✅ Classifieds (доски объявлений)
2. ✅ Issues (заявки/тикеты)
3. ✅ Events (события)
4. ✅ Custom (кастомные)

**New (Week 3-4):**
5. ✨ Surveys/Polls (опросы/голосования)
   - Multiple question types (single/multiple choice, text, rating)
   - Results visualization (charts, graphs)
   - Anonymous voting option
   - Export results to CSV
   - Share results in Telegram

**Future (Backlog):**
6. Forms (регистрационные формы)
7. Directories (справочники участников/ресурсов)
8. Bookings (бронирование ресурсов/времени)
9. Wikis (коллективные базы знаний)
10. Marketplaces (внутренние маркетплейсы)
11. **Reactions/Likes для Items** 💙
   - Реакции на объявления (❤️ лайки, 👍 и т.п.)
   - Счетчики реакций на карточках
   - Учет популярности в AI Constructor (опция "добавить лайки?")
   - Уведомления авторам о реакциях

---

**Prepared by:** AI Assistant  
**Approved by:** Founder  
**Status:** Ready to Execute 🚀

