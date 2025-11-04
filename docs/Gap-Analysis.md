# Gap Analysis — Orbo 1.1 vs Product Strategy

## 1. Alignment Snapshot

| Domain | Strategy Expectation | Current Implementation | Status |
| --- | --- | --- | --- |
| **S1 — Telegram-first Communities** | Guided bot onboarding, automatic admin verification, live activity analytics, CRM with renewal nudges. | Webhook  group discovery solid, but admin verification/manual mapping missing; dashboard heuristics exist; CRM lacks renewal automation. | ⚠️ Partially aligned |
| **S1 — Payments & Billing** | YooKassa / Tinkoff integrations, automated reconcile, membership status sync. | No payment providers implemented; `organizations.plan` unused; membership renewal manual. | ❌ Missing |
| **S1 — Events & QR** | Create → promote → register → check-in → attendance analytics. | CRUD  registration  QR check-in live, ICS export available; attendance analytics manual, no offline scan fallback. | ⚠️ Partially aligned |
| **S1 — Retention Analytics** | DAU/WAU, churn alerts, silent cohort surfacing. | 14-day message chart  heuristic attention zones; no cohort exports or silent list UI. | ⚠️ Partially aligned |
| **S2 — Corporate Layer** | Fine-grained permissions, offboarding workflows, audit logs, escalation alerts. | Roles limited to owner/admin/member; service-role bypass for admin actions; no audit log or escalation flows. | ❌ Missing |
| **S2 — Access Lifecycle** | Automated offboarding, device/session management, least-privilege service accounts. | Admin sync from Telegram keeps roles in sync, but no offboarding beyond manual membership removal; no scoped service tokens. | ⚠️ Early |
| **S3 — Marketplace v0** | Internal modules (Digest, Conflict Signals, Request Board) plus extension API/SDK skeleton. | No extension registry or runtime; no API surface for external modules. | ❌ Missing |
| **S3 — Platform Extensibility** | Webhook/event bus, permission grants per extension, billing split hooks. | Telegram event processing is monolithic; no pluggable interface or audit. | ❌ Missing |

## 2. User Flow Assessment

### Owner / Admin Flow
1. **Create organization** → works; onboarding checklist prompts next steps.
2. **Connect Telegram bot** → webhook receives events but admin permission check/manual mapping slow; no warnings if bot loses admin rights.
3. **Manage members** → participant list rich, but renewal reminders / billing absent; duplicates handled manually.
4. **Launch events** → registration & QR check-in succeed; analytics on attendance limited.
5. **Monitor health** → dashboard heuristics highlight risks but no DAU/WAU baseline; no export.
6. **Setup payments** → impossible without engineering workarounds.
7. **Install extensions** → not available; documentation only.

### Participant Flow
1. **Join via Telegram** → webhook  admin sync add participants; DM auth codes allow login. Manual invites via link functioning.
2. **Access portal** → members UI read-only; lacks personalized renewal prompts.
3. **Register for events** → works; receives QR token email/DM; check-in updates status. No reminder notifications beyond initial message.
4. **Manage profile** → can link/unlink Telegram; limited custom attributes editing.

### Corporate Admin Flow (Target Pilot)
1. **Provision teams** → cannot assign granular scopes; service-role operations require trust.
2. **Offboard user** → remove membership manually; no webhook to revoke Telegram admin automatically.
3. **Audit actions** → no audit log; console logs only.
4. **Escalations** → no alerting or SLA tracking; heuristics only visible in dashboard UI.

## 3. Critical Gaps vs PRD

| Gap | Impact | Root Cause | Suggested Remedy |
| --- | --- | --- | --- |
| Payments infrastructure absent | Blocks monetization and renewal automation | No integration work started; schema lacking invoices/subscriptions | Prioritize payment provider integration (Wave 1), introduce billing tables, webhook handlers |
| Telegram admin health missing | Risk of silent disconnects, compliance breach | Manual mapping; no permission verification | Add admin rights check, health monitors, alerts |
| Service-role dependency for core UX | Potential tenant data leaks, security risk | Convenience shortcuts using service-role clients | Implement scoped RPC endpoints  row filters, audit usage |
| No observability/CI baseline | Bugs reach production silently | Logging limited to console; no tests | Introduce logging library, metrics, minimal automated tests |
| Marketplace scaffolding absent | Cannot test growth hooks | Architecture lacks extension model | Define extension tables, registration API, first-party modules |

## 4. Readiness by Wave

| Wave | Goal | Readiness | Notes |
| --- | --- | --- | --- |
| **Wave 0 (Stabilization)** | Harden Telegram ingestion, tenant safety, observability. | 60% — flows exist but fragile; needs healthchecks  logging. | Focus on webhook idempotency, admin verification, structured logging. |
| **Wave 1 (MVP-fit)** | Deliver CRM renewals, payments, events analytics. | 35% — CRM UI in place; payments/renewals absent. | Build payment backbone, automate reminders, add attendance dashboards. |
| **Wave 2 (Growth hooks)** | Launch referrals, churn alerts, marketplace modules. | 10% — heuristics exist but no automation/extensibility. | Requires new services: notification routing, extension runtime. |
