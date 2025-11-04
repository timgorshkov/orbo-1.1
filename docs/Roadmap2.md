# 12-week Roadmap (Wave 0–2)

## 1. Prioritization Model
- **Reach**: Estimated number of active organizations / admins impacted within 90 days (baseline: 220 active orgs, 35 pilot corp teams, 15 internal extension consumers).
- **Impact**: 1 (minor) – 5 (transformational) scoring on PMF and revenue unlock.
- **Confidence**: Evidence confidence (0–1) factoring code familiarity and dependencies.
- **Effort**: Relative story points (1 pt ≈ 0.5 engineer-week).

### 1.1 RICE Backlog
| Epic / Task | Scenario | Reach | Impact | Confidence | Effort | RICE |
| --- | --- | --- | --- | --- | --- | --- |
| Telegram Health & Admin Verification | S1 | 220 | 4 | 0.7 | 6 | 102 |
| Tenant Guardrails & Audit Log | S2 | 180 | 4 | 0.6 | 7 | 62 |
| Observability Baseline & CI | S1/S2 | 220 | 3 | 0.65 | 6 | 71 |
| Participant Renewal Engine | S1 | 160 | 4 | 0.55 | 8 | 44 |
| Payments Integration (YooKassa  Reconcile) | S1 | 140 | 5 | 0.45 | 10 | 32 |
| Event Attendance Insights | S1 | 160 | 3 | 0.6 | 6 | 48 |
| Corporate Offboarding & Escalations | S2 | 60 | 4 | 0.5 | 6 | 20 |
| Marketplace Skeleton  Internal Modules | S3 | 90 | 4 | 0.45 | 12 | 13 |
| Referral Hooks & Churn Alerts | S1/S3 | 120 | 3 | 0.5 | 7 | 26 |

## 2. Wave Plan

### Wave 0 — Stabilization (Weeks 1–2)
| Task | Goal | DoD | Risks | Mitigation |
| --- | --- | --- | --- | --- |
| Telegram Health & Admin Verification | Ensure bot connection remains healthy and admins verified | - Webhook idempotency table reinstated with `update_id`
- Admin rights check via `getChatMember` before mapping
- Health widget in `/settings` showing last sync  errors
- Cron endpoint logs to new `telegram_health_events` | Telegram rate limits, Supabase function cost | Implement exponential backoff, store last error, dry-run in staging |
| Observability Baseline & CI | Detect failures early | - Pino-based structured logger
- Sentry (server  client) wired with scrubbed PII
- `pnpm lint`  unit test placeholder run in CI
- Healthcheck exports uptime-ready metrics | Noise from verbose logs | Add log sampling; redact PII |
| Tenant Guardrails & Audit Log | Prevent cross-org leakage | - Replace direct service-role queries with RPC wrappers
- Introduce `admin_action_log` table  helper writing entries
- Static analysis to block service-role in client components | Perf regressions due to extra RPC | Cache org-scoped queries, add Supabase view indexes |

### Wave 1 — MVP-fit (Weeks 3–8)
| Task | Goal | DoD | Risks | Mitigation |
| --- | --- | --- | --- | --- |
| Participant Renewal Engine | Automate membership lifecycle | - Membership status model  reminder schedule
- Telegram/email reminder worker (cron)
- UI badges for overdue renewals
- Integration test covering reminder send  status transition | Messaging fatigue, inaccurate statuses | Allow snooze, add manual override, monitor metrics |
| Payments Integration (YooKassa  Reconcile) | Capture revenue automatically | - Checkout link generation endpoint
- Signed webhook handler (retry-safe, idempotent)
- Map payments to memberships  ledger table
- Runbook for keys & test cards | Provider onboarding delays, webhook retries | Build sandbox first, add DLQ, align legal early |
| Event Attendance Insights | Turn attendance data into insight | - Materialized view for attendance vs invites
- Dashboard widget showing attendance %, no-shows
- Export CSV for attendance
- QR tokens hashed  TTL enforcement | Legacy tokens break | Provide migration script regenerating hashes |
| Observability Iteration | Expand baseline | - Add Supabase log drain to BigQuery
- Define alert thresholds (webhook failure, cron failure)
- Document runbooks for triage | Alert fatigue | Tune thresholds with pilot data |

### Wave 2 — Growth Hooks (Weeks 9–12)
| Task | Goal | DoD | Risks | Mitigation |
| --- | --- | --- | --- | --- |
| Referral Hooks & Churn Alerts | Drive growth & retain members | - Admin referral links with attribution
- Churn alert heuristics piped to Telegram/email notifications
- Silent cohort list export
- Success metrics dashboard | Spam/referral abuse | Rate limit invites, require approval for bulk outreach |
| Corporate Offboarding & Escalations | Support pilot corp workflows | - Role scopes (viewer/editor)  offboarding checklist
- Auto revoke Telegram admin on removal via bot
- Escalation alert config per org (Telegram/email)
- Audit log surfaced in UI | Telegram API delays for revoke | Queue retries, display pending status |
| Marketplace Skeleton  Internal Modules | Enable extension ecosystem | - Tables: `extensions`, `extension_installations`, permission grants
- Extension SDK (webhook/event bus contract)
- Internal modules: Daily Digest, Conflict Signals, Request Board (read-only using aggregated data)
- API keys per extension with scoped permissions | Extension isolation, security review | Sandbox runtime first, require review, throttle API |

## 3. Cross-cutting Enablers
- **Documentation**: Update `/docs/Runbook.md`, `/docs/Tech-Notes.md` with each milestone. Add architecture decision records (ADRs) for payments, extensions.
- **Testing**: Introduce Playwright smoke for Telegram onboarding wizard (Wave 0), Vitest for services (Wave 1), contract tests for extension SDK (Wave 2).
- **People**: Assign Telegram specialist for Wave 0, payments engineer for Wave 1, platform engineer for Wave 2.
