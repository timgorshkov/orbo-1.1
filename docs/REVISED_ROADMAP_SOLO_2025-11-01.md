# 🚀 Revised Roadmap — Solo Founder Edition

**Дата:** 1 ноября 2025  
**Контекст:** Solo-founder, 3-4 часа/день, фокус на вау-эффект и PMF  
**Horizon:** 16 недель (4 месяца) до marketplace с первыми модулями

---

## 🎯 Стратегические изменения

### Что изменилось vs original Roadmap2.md:

| Аспект | Original | Revised | Rationale |
|--------|----------|---------|-----------|
| **Timeline** | 12 недель | **16 недель** | Solo-founder 3-4h/day требует реалистичных сроков |
| **Wave 0 focus** | Stabilization only | **Stabilization + Analytics + Import** | Вау-эффект для первых пользователей |
| **Payments priority** | Platform billing (Wave 1) | **Client payments manual + Platform billing (Wave 2)** | PMF validation сначала |
| **Corporate features** | Wave 2 | **Postponed** (Wave 3+) | No demand yet |
| **Marketplace** | Wave 2 (week 9-12) | **Wave 1b (week 7-10)** | Real external demand + internal modules |
| **Payment provider** | YooKassa/Tinkoff | **Prodamus** (для платформы + клиентов) | Legal/taxation alignment |

---

## 📊 Capacity Planning

### Solo-Founder Reality Check

**Available capacity:**
- 3-4 hours/day × 7 days = **21-28 hours/week**
- Minus meetings, support, admin = **~20 hours/week productive**

**Story point calibration:**
- 1 point = **~2-3 hours** (vs standard 4 hours with team)
- Sprint velocity: **~8-10 points/week** (conservative)

**External help:**
- CTO consultant: 1 session/2 weeks for architecture review
- Design help: As needed для marketplace UI

---

## 🌊 Wave Structure (Revised)

### Wave 0 — Foundation + Wow-Effect (Weeks 1-6) ⚡

**Цель:** Stable platform + аналитика для первых пользователей

**Duration:** 6 недель (было 2)  
**Effort:** 48-60 points

#### Block 0.1: Critical Stabilization (Weeks 1-2)

| Task | Why Critical | Points | Owner |
|------|--------------|--------|-------|
| **Telegram Webhook Health Monitor** | Silent disconnects убивают trust | 4 | You + AI |
| **Basic Observability** | Видеть ошибки до того, как users уйдут | 4 | You + AI |
| **Admin Action Audit Log** | Track changes for debugging | 3 | You + AI |

**Subtasks:**
1. Restore idempotency table (simplified, `update_id` only)
2. Health check endpoint returning last sync status
3. Pino structured logger (replace console.*)
4. Simple error aggregation page (no external service yet)
5. `admin_action_log` table + helper function

**Success criteria:**
- ✅ Webhook status visible in UI
- ✅ Errors logged with context (org_id, tg_group_id)
- ✅ Can trace admin actions

---

#### Block 0.2: Analytics Wow-Effect (Weeks 3-4) 📊

| Task | Wow-Effect | Points | Priority |
|------|------------|--------|----------|
| **Group Analytics Dashboard** | Визуализация активности группы | 8 | **Critical** |
| **Message Import (JSON)** | Импорт истории → context enrichment | 6 | **Critical** |
| **Participant Profile Enrichment** | Автообогащение из сообщений | 5 | High |

**Subtasks:**

**Group Analytics Dashboard:**
1. Activity timeline (messages/day за 30 дней)
2. Top contributors (по сообщениям)
3. Peak hours heatmap
4. Join/leave trends
5. Silent members list (no messages 7+ days)

**Message Import (JSON → HTML):**
1. Rewrite import parser: HTML → JSON export
2. Bulk insert optimization (batch 1000 messages)
3. Extract metadata: replies, forwards, media types
4. Link messages → participants
5. Progress indicator в UI

**Profile Enrichment:**
1. Extract topics from message history (keyword frequency)
2. Calculate participation score (messages + replies)
3. Identify connectors (most replied-to)
4. Activity patterns (time of day)
5. Update participant profiles automatically

**Success criteria:**
- ✅ Владелец группы видит красивый dashboard с insights
- ✅ Импорт 10k messages работает без timeout
- ✅ Профили участников автоматически обогащены

**Wow-effect validation:**
- После этого блока пользователи должны сказать "Wow, я не знал, что в моей группе такое происходит!"

---

#### Block 0.3: Quick Wins (Weeks 5-6) 🎁

| Task | Impact | Points |
|------|--------|--------|
| **Event attendance insights** | Show no-show rates, best time slots | 4 |
| **QR token security** | Hash + TTL (prevent replay) | 2 |
| **Telegram admin rights verification** | Prevent silent failures | 3 |
| **Participant deduplication UI** | Merge duplicates with 1 click | 4 |

**Success criteria:**
- ✅ Event organizers see attendance analytics
- ✅ QR tokens secure
- ✅ Admin can verify bot status
- ✅ Easy duplicate cleanup

**Total Wave 0:** 43 points ≈ **5 weeks** (с buffer = 6 недель)

---

### Wave 1a — Client Payments + Subscriptions (Weeks 7-10) 💰

**Цель:** Clients can charge members, platform tracks subscriptions

**Duration:** 4 недели  
**Effort:** 28-32 points

#### Part 1: Manual Payment Tracking (Weeks 7-8)

| Task | Description | Points |
|------|-------------|--------|
| **Payment Schema** | `subscriptions`, `payments`, `payment_methods` | 3 |
| **Manual Payment UI** | Admin creates payment record, marks status | 5 |
| **Payment Method Config** | Text description (card #, bank details) | 2 |
| **Membership Status Sync** | Link payments → membership status | 3 |

**Payment methods:**
- "Перевод на карту: 1234 5678 9012 3456"
- "Оплата от юр. лица по реквизитам: ИНН 123, р/с 456..."
- Custom text field

**Status tracking:**
- Manual: `pending`, `confirmed`, `expired`
- Admin can mark payment as received
- Auto-update membership status

**Success criteria:**
- ✅ Admin создает "subscription" за 1,500₽/мес
- ✅ Participant видит payment details
- ✅ Admin marks payment → membership status updates

---

#### Part 2: Prodamus Integration Prep (Weeks 9-10)

| Task | Description | Points |
|------|-------------|--------|
| **Prodamus API Research** | Study docs, test sandbox | 2 |
| **Checkout Link Generation** | Generate payment links | 4 |
| **Webhook Handler (stub)** | Receive payment confirmations | 3 |
| **Payment Reconciliation** | Match webhook → subscription | 3 |

**Note:** Это **prep work**, full integration в Wave 2 после PMF validation

**Success criteria:**
- ✅ Can generate Prodamus checkout link
- ✅ Webhook stub ready (logs events)
- ✅ Manual reconciliation tested

**Total Wave 1a:** 25 points ≈ **3 недели** (с buffer = 4 недели)

---

### Wave 1b — Marketplace Foundation (Weeks 11-14) 🛒

**Цель:** Internal modules working, external API ready

**Duration:** 4 недели  
**Effort:** 32-36 points

#### Part 1: Marketplace Schema + Runtime (Weeks 11-12)

| Task | Description | Points |
|------|-------------|--------|
| **Extension Tables** | `extensions`, `installations`, `permissions` | 3 |
| **Permission Model** | Scoped access (read participants, write events) | 4 |
| **API Keys** | Per-extension auth tokens | 3 |
| **Extension SDK (stub)** | Webhook receiver + API client | 4 |

**Schema:**
```sql
extensions (id, name, author, webhook_url, scopes[])
extension_installations (org_id, extension_id, config_json, status)
extension_permissions (installation_id, resource, actions[])
extension_api_keys (installation_id, key_hash, scopes[], expires_at)
```

**Success criteria:**
- ✅ Extension can be "installed" по org
- ✅ API key scoped to org + extension
- ✅ Webhook events routed to extension

---

#### Part 2: Internal Modules (Weeks 13-14)

| Task | Description | Points | Priority |
|------|-------------|--------|----------|
| **Daily Digest Module** | Cron → daily summary (email/Telegram) | 8 | **Critical** |
| **Conflict Signals Module** | Detect sentiment drops, heated threads | 6 | **Critical** |
| **Marketplace UI** | Browse, install, configure extensions | 6 | High |

**Daily Digest:**
- New members (with profiles)
- Top contributors
- Upcoming events
- Silent members alert
- Delivered via email + Telegram DM

**Conflict Signals:**
- Thread reply count spike (>3σ)
- Negative sentiment keywords (simple heuristic)
- Admin removal events
- Alert org owner via Telegram

**Marketplace UI:**
- Browse available extensions
- Install with 1 click
- Configure extension settings
- View logs/events

**Success criteria:**
- ✅ Org owner receives daily digest every morning
- ✅ Conflict alert fires when thread heated
- ✅ Can install/configure extensions via UI

**Total Wave 1b:** 34 points ≈ **4 недели**

---

### Wave 2 — Automation + Scale (Weeks 15-20) 🚀

**Цель:** Automated billing, platform growth features

**Duration:** 6 недель (tentative)  
**Effort:** ~40 points

#### Platform Billing (для Orbo)

| Task | Points |
|------|--------|
| Prodamus integration (platform subscriptions) | 8 |
| Plan limits enforcement (participants, groups) | 4 |
| Upgrade flow UI | 4 |
| Billing admin panel | 4 |

#### Renewal Automation (для клиентов)

| Task | Points |
|------|--------|
| Automated renewal reminders (email + TG) | 6 |
| Expiration workflows | 4 |
| Payment retry logic | 4 |

#### Marketplace Growth

| Task | Points |
|------|--------|
| External partner API documentation | 3 |
| Partner onboarding flow | 3 |

**Total Wave 2:** 40 points ≈ **5 недель** (с buffer = 6)

**Note:** Wave 2 schedule depends on Wave 0-1 learnings

---

## 📅 Timeline Overview

```
Week 1-2:   Block 0.1 (Critical Stabilization)      ████
Week 3-4:   Block 0.2 (Analytics Wow-Effect)        ████
Week 5-6:   Block 0.3 (Quick Wins)                  ████
                                                     └─ WAVE 0 COMPLETE ✓
Week 7-8:   Wave 1a Part 1 (Manual Payments)        ███
Week 9-10:  Wave 1a Part 2 (Prodamus Prep)          ███
                                                     └─ WAVE 1a COMPLETE ✓
Week 11-12: Wave 1b Part 1 (Marketplace Schema)     ███
Week 13-14: Wave 1b Part 2 (Internal Modules)       ███
                                                     └─ WAVE 1b COMPLETE ✓
Week 15-20: Wave 2 (Automation + Scale)             ██████ (tentative)
```

**Total:** 14 недель до marketplace launch (3.5 месяца)  
**Buffer:** +2 недели для unexpected issues = **16 недель**

---

## 🎯 Success Metrics (per Wave)

### Wave 0 Success:
- [ ] Zero webhook failures >10min undetected
- [ ] Errors visible in simple dashboard
- [ ] 3 orgs using analytics dashboard daily
- [ ] 10k+ messages imported successfully
- [ ] "Wow" feedback from at least 2 test users

### Wave 1a Success:
- [ ] 5 orgs tracking manual payments
- [ ] At least 1 paid subscription recorded
- [ ] Prodamus test payment successful
- [ ] Zero payment reconciliation errors

### Wave 1b Success:
- [ ] Daily Digest sent to 10+ orgs
- [ ] Conflict alert fired (and accurate)
- [ ] 1 external partner integrated via API
- [ ] Marketplace UI live with 2+ modules

### Wave 2 Success:
- [ ] Platform billing live (Orbo revenue)
- [ ] Plan limits enforced
- [ ] Automated renewals working
- [ ] 50+ orgs on platform (growth signal)

---

## 🔥 Immediate Next Steps (This Week)

### Day 1-2: Wave 0.1 Kickoff

**Monday:**
1. ✅ Apply migration 074 (participant scoring) — already ready
2. ✅ Create migration 075 (idempotency table restoration)
3. ✅ Setup basic error logging page (no external service)

**Tuesday:**
4. ✅ Implement webhook health check endpoint
5. ✅ Add health status widget to settings UI

### Day 3-4: Observability

**Wednesday:**
6. ✅ Replace console.* with Pino (structured logs)
7. ✅ Create simple error dashboard page

**Thursday:**
8. ✅ Add admin_action_log table + helper
9. ✅ Test end-to-end: webhook → logs → dashboard

### Day 5-7: Analytics Kickoff

**Friday:**
10. ✅ Design Group Analytics UI mockup
11. ✅ Create analytics API endpoint (basic stats)

**Weekend:**
12. ✅ Start message import refactor (JSON parser)
13. ✅ Test with small export file

---

## 🛠️ Technical Decisions

### Observability (Minimal Cost)

**Instead of:** Sentry + BigQuery + Logflare  
**Use:**
- Supabase table `error_logs` (queryable via SQL)
- Simple dashboard page showing recent errors
- Email digest once/day with error summary
- Cost: **$0** (within Supabase free tier initially)

**Upgrade path:** When >1000 errors/day, migrate to Sentry

---

### Analytics Stack

**Keep it simple:**
- Postgres materialized views for dashboards
- Chart.js / Recharts for visualizations
- Pre-aggregate daily (cron job)
- Export to CSV for power users

---

### Marketplace Architecture

**Phase 1 (Internal modules):**
- Run as serverless functions (Vercel/Supabase)
- Direct DB access (scoped by org_id)
- No sandbox yet

**Phase 2 (External partners):**
- Webhook-based event delivery
- REST API with scoped tokens
- Read-only access to start
- Review process before write access

---

## 💰 Cost Projections

### Months 1-2 (Wave 0-1a):
- Supabase: Free tier (~$0)
- Vercel: Hobby plan ($0)
- Domain: ~$10/month
- **Total: ~$10/month**

### Months 3-4 (Wave 1b-2):
- Supabase: Pro ($25/month) — if exceed free tier
- Vercel: Pro ($20/month) — for better limits
- Prodamus: Transaction fees only (~2.8%)
- **Total: ~$50/month + transaction fees**

### After PMF:
- Scale up based on usage
- Observability tools: Sentry (~$26/month)
- Analytics: Keep in-house for now

---

## 🎨 Design Priorities

### Wave 0.2 (Analytics Dashboard):
**Must nail this for wow-effect:**
- Clean, modern charts (Tremor or Recharts)
- Mobile-responsive
- Export to PDF/CSV
- Share link (public/private toggle)

**Inspiration:**
- Amplitude dashboard (clean metrics)
- Telegram Analytics (familiar to users)
- Circle dashboard (community vibes)

**Design review:** With CTO consultant week 4

---

### Wave 1b (Marketplace UI):
**Key experience:**
- App store feel (browse, install, configure)
- Clear permission requests
- Easy enable/disable
- Activity logs per extension

**Design review:** Week 13

---

## ⚠️ Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Solo burnout | Medium | High | Strict 4h/day limit, buffer weeks |
| Import performance issues | Medium | Medium | Batch processing, queue system |
| Prodamus integration delays | Low | Medium | Start with manual, iterate |
| External partner API breaks | Low | High | Versioned API, changelog |
| Analytics slow on large groups | Medium | Medium | Materialized views, pagination |

---

## 🎯 Prioritization Framework (Going Forward)

For every new request, ask:

1. **Does it create wow-effect?** (Analytics, insights) → High priority
2. **Does it unlock revenue?** (Payments, subscriptions) → High priority
3. **Does it prevent churn?** (Reliability, notifications) → High priority
4. **Is it tech debt?** → Medium priority (batch with features)
5. **Is it nice-to-have?** → Backlog

**Rule:** Every sprint should have 70% wow-effect, 20% reliability, 10% tech debt

---

## 📞 Check-ins & Reviews

### Weekly Sync (Every Monday):
- Review last week velocity (actual vs planned)
- Plan this week (pick 8-10 points)
- Surface blockers

### Bi-weekly CTO Review (Every other Friday):
- Architecture decisions
- Code review (critical paths)
- Performance/security audit

### Monthly Retrospective:
- Metrics review (usage, errors, feedback)
- Roadmap adjustment
- Celebrate wins 🎉

---

## 📚 Resources

### Code Templates:
- Extension SDK boilerplate
- Dashboard components library
- API client examples

### Documentation:
- Prodamus API guide
- Extension developer docs
- Analytics schema reference

### Tools:
- Excalidraw (architecture diagrams)
- Figma (UI mockups)
- Linear/GitHub Projects (task tracking)

---

## 🚀 Launch Checklist (Week 14)

Before announcing marketplace to first partners:

- [ ] 3+ internal modules working flawlessly
- [ ] API documentation complete
- [ ] Rate limits implemented
- [ ] Monitoring dashboard shows green
- [ ] Legal terms for partners ready
- [ ] Support process defined
- [ ] Demo video recorded
- [ ] Blog post written

---

**Ready to start Wave 0.1 Block 1 this week?** 🔥

Let me know and I'll create the detailed technical plan for days 1-7!

