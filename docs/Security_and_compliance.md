# Security & Compliance Assessment — Orbo 1.1 (Nov 2025)

This refresh reflects the architecture/code state as of the Nov 15 roadmap (`docs/ROADMAP_FINAL_NOV15_2025.md`) and drives Wave 0 stabilization goals.

## 1. Context & Scope
- Platform: Next.js 14 on Vercel, Supabase (Postgres  Auth  Storage), Telegram bots.
- Tenancy: Multi-org SaaS for communities, with future corp pilots and marketplace modules.
- Data: Participant PII (names, emails, phone, Telegram IDs), activity metadata, event attendance, materials content.

## 2. Threat Model (STRIDE-lite)
| Category | Threat | Current Controls | Gaps / Actions |
| --- | --- | --- | --- |
| **Spoofing** | Unauthorized API access, Telegram impersonation. | Supabase Auth (magic links); Telegram webhook secret. | Missing bot signature verification for incoming commands; service-role usage bypasses RLS. Add HMAC for internal webhooks, restrict service-role to backend services. |
| **Tampering** | Modifying participant/event data across tenants. | Row Level Security on most tables. | Service-role clients in API/routes bypass RLS; no audit log. Implement org-scoped RPCs  `admin_action_log`. |
| **Repudiation** | Admin actions not tracked. | None since migration 072 removed audit logs. | Restore audit log table capturing user_id, org_id, action, payload, timestamp; expose read-only view. |
| **Information Disclosure** | PII leakage via logs or mis-scoped queries. | No structured logging; some redaction in UI. | `console.log` outputs may include secrets (tokens). Add logger with redaction; ensure Sentry scrub rules; reintroduce `.env.example` to document secrets. |
| **Denial of Service** | Telegram rate limits exceeded, cron abuse. | Webhook returns 200 quickly; recovery service with attempt limits. | No rate limiting/backoff in message sending; no queue. Implement retry with exponential backoff; monitor 429 responses. |
| **Elevation of Privilege** | Participant gaining admin via Telegram. | `syncOrgAdmins` cross-checks admin status; invites require email. | Lack of offboarding automation; viewer role not enforced. Add removal workflows, ensure admin -> member transitions revoke Telegram privileges. |

### Nov 15 Findings Driving Wave 0
- **Service-role exposure**: `createAdminServer()` returns a full service-role client for server components and API routes, so any compromised route can read/write across tenants. Wave 0 must move to RPCs and scoped service tokens.
- **Missing idempotency**: `eventProcessingService` explicitly notes "Idempotency is not currently implemented" after migration 42 removed `telegram_updates`, so retries replay events and inflate metrics—violating integrity requirements.
- **Webhook recovery flooding**: On a secret mismatch, `/api/telegram/webhook` instantly calls `webhookRecoveryService.recoverWebhook()` with no throttling, potentially hitting Telegram rate limits repeatedly instead of alerting operators.
- **Audit gap**: There is no replacement for the removed admin action log, so administrators can merge participants or remap Telegram groups without traceability—blocking S2 compliance goals.

## 3. Data Protection
- **PII Storage**: Participant emails/phones stored in Supabase; Telegram IDs stored as integers. No encryption-at-rest beyond Supabase default; consider encrypting phone/email using Postgres pgcrypto for corp tenants.
- **Minimization**: Message text not stored; only metadata (`activity_events`, `group_metrics`). Materials content stored in `material_items.content` (markdown) and storage files.
- **Retention**: No automated deletion. Need policy for participant offboarding (Wave 2) and data export (Wave 1).
- **Backups**: Rely on Supabase automated backups. Document recovery procedure in Runbook.

## 4. Access Control & Offboarding
- User roles: owner/admin/member; viewer missing. `user_telegram_accounts.is_verified` ensures bots DM verified admins.
- Offboarding gaps: Removing membership does not revoke Telegram admin automatically; no script to remove `telegram_group_admins` or revoke invite links.
- Planned: Offboarding wizard (Wave 2) to remove admin roles, revoke Telegram rights via bot, log event, and optionally anonymize participant data.

## 5. Logging & Monitoring
- Current logging: `console.log` across API routes (includes tokens). No centralized storage or alerting.
- Health endpoints: `/api/health` (DB ping), `/api/healthz` (webhook checks). Cron success logged to console only.
- Actions: Introduce structured logging (Pino) with redaction, stream to Vercel/Supabase logs; integrate Sentry with sampling; create `system_heartbeats` table updated by cron jobs; set up alerts for missing heartbeats (>15 min) and webhook secret mismatches.

## 6. Telegram Compliance & Limits
- **Rate limits**: Bot API limit ~30 req/sec per bot; current implementation sends notifications sequentially per event. Must add backoff and chunk sending in cron tasks.
- **Privacy**: Telegram requires opt-in (user must start bot). `/api/telegram/accounts` handles DM verification but needs explicit error handling (currently returns BOT_BLOCKED). Document requirement in Runbook and UI.
- **Data policy**: Only store metadata; avoid message content to comply with Telegram ToS. Already followed.
- **Webhooks**: Ensure HTTPS endpoint with secret; rotate secret via environment management; recovery service should alert on repeated failures.

## 7. Payments & Compliance (Planned)
- When integrating YooKassa/T-Bank:
  - Store provider keys outside repo (secret manager). Document rotation.
  - Capture payment payloads in `payment_events` with idempotency key; avoid storing full card data (YooKassa tokenization).
  - Implement webhook signature validation and retries with exponential backoff.
  - For corp pilots, ensure invoices include company details; run reconciliations daily.
  - Add PCI consideration: stay SAQ-A by using hosted payment page only.

## 8. Marketplace Security Considerations
- Extensions should operate via signed webhooks and scoped API keys (`extension_api_keys` table). Enforce tenant isolation by filtering events by `org_id` before dispatch.
- Provide sandbox environment; review extension code (if internal) or require review for external partners.
- Billing split to leverage ledger entries; ensure extensions cannot initiate payouts without approval.

## 9. Compliance Checklist
- [ ] Reinstate audit logging.
- [ ] Provide data export  deletion runbook.
- [ ] Document incident response (contact chain, Slack alert, Supabase rollback steps).
- [ ] Ensure `.env.example` includes all secrets with notes on storage.
- [ ] Add privacy notice covering Telegram ID usage and retention.
