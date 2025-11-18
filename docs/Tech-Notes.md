# Tech Notes — Orbo 1.1 (Nov 2025)

This technical note is synced with `docs/ROADMAP_FINAL_NOV15_2025.md`; every Wave 0 task below feeds directly into the stabilization slice of that plan.

## 1. Multi-tenancy & Access
- **Org boundary**: `org_id` present on `participants`, `participant_groups`, `telegram_groups`, `events`, `materials`, etc. SQL functions `is_org_member_rpc` and `get_user_role_in_org` enforce membership; both run as SECURITY DEFINER.
- **Current gap**: Many server components/API routes call `createAdminServer()` (service role) and manually filter by `org_id` (e.g., `app/app/[org]/members/page.tsx`, `/api/dashboard/[orgId]/route.ts`). This bypasses RLS and risks data leakage. Removing this dependency is the highest priority for Wave 0.
- **Planned fix (Wave 0)**: Introduce RPC wrappers returning pre-filtered payloads (`get_members_overview(org uuid)`, `get_dashboard_metrics(org uuid)`), remove service-role from request path, and centralize audit logging into new `admin_action_log` table.
- **Role model**: `memberships.role` (owner/admin/member). Viewer role defined in PRD but not surfaced; `get_user_role_in_org` currently upgrades Telegram participants to `member` automatically.

## 2. Telegram Integration
- **Bots**: `TELEGRAM_BOT_TOKEN` (main) handles group updates via `/api/telegram/webhook`; `TELEGRAM_NOTIFICATIONS_BOT_TOKEN` used for DM verification in `/api/telegram/accounts`.
- **Webhook**: Validates secret `TELEGRAM_WEBHOOK_SECRET`, auto-recovers via `webhookRecoveryService`. Lacks dedupe table since migration 42 removed `telegram_updates`.
- **Health/monitoring gap**: When secrets mismatch the webhook immediately tries to re-register, so Wave 0 work must add a rate limiter  structured alert before calling Telegram again.
- **Group mapping**: Webhook creates `telegram_groups` row (without `org_id`); admins map groups via `/app/app/[org]/telegram/available-groups`. Admin sync uses `syncOrgAdmins` to populate `telegram_group_admins` and `user_group_admin_status`.
- **Cron**: `/api/cron/sync-users` placeholder updates `last_sync_at`; `/api/cron/check-webhook` verifies configuration; `/api/cron/event-notifications` sends scheduled reminders.
- **Planned**: Add `telegram_update_receipts` dedupe, health metrics table, and UI widget summarizing last sync status.

## 3. Participants & CRM
- `participants` store contact info; `participant_groups` map to Telegram chats; `participant_messages` table stores limited message metadata (counts).
- Duplicate resolution via `lib/services/participants/matcher.ts`; merges tracked in `participant_merge_history` (audit logging removed but to be reinstated).
- Planned `membership_status`, `renewal_date`, and reminder cron (Wave 1) to enable renewal automation.

## 4. Materials
- Tree built from `material_folders`  `material_items`. `MaterialService` caps depth at 3 and ensures parent existence. `material_access` allows group/participant-specific ACL but UI does not expose advanced permissions yet.
- Files uploaded via Supabase Storage (integration stubbed). Future improvement: add signed URL helper and quotas.

## 5. Events & Attendance
- Schema from `db/migrations/19_events.sql`: `events`, `event_registrations`, `event_telegram_notifications` with indexes on `org_id`, `event_date`.
- API routes: `/api/events` CRUD, `/api/events/checkin` verifies `qr_token`. Notifications cron posts to Telegram groups using bot token.
- TODO: ICS generation, attendance exports, timezone support, notification logging table.

## 6. Analytics Pipeline
- `activity_events` table tracks join/leave/message/checkin events; `group_metrics` stores aggregated daily counts per chat.
- Dashboard (`/api/dashboard/[orgId]`) aggregates last 14 days of `group_metrics`, counts participants via service-role, and surfaces heuristics (churning participants = no messages in 7 days  joined <30 days ago).
- Planned: materialized views for DAU/WAU, churn metrics, prime-time heatmap (Wave 1), plus churn alerts (Wave 2).

## 11. Security-Critical TODOs (Wave 0 blockers)
- Replace service-role usages with org-scoped Postgres RPCs (`get_members_overview`, `get_dashboard_metrics`) and emit entries into `admin_action_log` on every mutation (merges, Telegram group assignments, manual participant edits).
- Reinstate webhook idempotency via `telegram_update_receipts` (update_id  bot_type) and enforce TTL cleanup to avoid unbounded growth.
- Introduce `system_heartbeats` table for cron observability plus a `/api/telegram/health` endpoint feeding dashboard widgets and alerting.
- Create rate limiter/backoff for `webhookRecoveryService` so repeated secret mismatches surface in logs/alerts instead of spamming Telegram.

## 7. Payments & Billing (Future)
- Current schema lacks payments tables. Planned additions (Wave 1):
  - `subscriptions` (id, org_id, participant_id, status, renewal_date, plan, provider_customer_id).
  - `payment_intents` (id, org_id, participant_id, provider, provider_payment_id, amount, currency, status, expires_at, metadata).
  - `payment_events` (id, payment_intent_id, event_type, payload_json, processed_at, idempotency_key).
  - `org_ledger_entries` for revenue tracking and future marketplace split.
- YooKassa integration: server endpoint to create payment, webhook verifying `sha256` signature, reconcile cron to mark renewals.
- Billing split for marketplace reserved for Wave 2 once extensions exist.

## 8. CI/CD & Tooling
- **Current**: No CI. Local commands `npm run lint`, `npm run build`, `npm run dev`. Database migrations run manually through Supabase.
- **Plan**: GitHub Actions workflow: install deps (`npm ci`), run lint/build, optionally run Vitest (once tests exist). Add Supabase migration verification step (generate types, diff check) for staging.
- Deploy: Vercel auto-deploy from default branch. Document environment promotion and cron secret rotation in Runbook.

## 9. Observability & Reliability
- Present: `console.log` heavy; `app/api/health` checks DB connectivity; `app/api/healthz` optionally checks webhook configuration (expects env vars `TELEGRAM_BOT_TOKEN_MAIN`, etc.).
- Planned: Pino logger with correlation IDs, Sentry instrumentation, Supabase table `system_heartbeats` updated by cron jobs, BigQuery (or Supabase logs) export for webhook events.
- Add `alerts` on: webhook secret mismatch, cron failure, payment reconcile errors, participant dedupe anomalies.

## 10. Security Notes
- Secrets loaded from process env; `.env.example` absent (to be reintroduced). Ensure service role key never exposed to client.
- STRIDE summary captured in `docs/Security&Compliance.md` (updated below). Critical to re-enable audit logging for admin actions and handle offboarding flows.

