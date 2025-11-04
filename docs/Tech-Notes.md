# Technical Notes

## 1. Multi-tenancy & Permissions
- **Org scoping**: `organizations`, `memberships`, `org_telegram_groups`, and `participants` tables include `org_id`. Access checks rely on Postgres RLS and RPC helpers (`is_org_member_rpc`, `get_user_role_in_org`).
- **Service-role usage**: Server components and route handlers frequently create service-role clients (`createAdminServer`) to bypass RLS for cross-entity fetches (participants, dashboard metrics). This is necessary today but requires guardrails (filters  audit log) before corporate pilots.
- **Admin sync**: `requireOrgAccess` triggers `sync_telegram_admins` RPC, which reads Telegram admin cache tables and updates `memberships`. Ensure background failures are surfaced once observability lands.
- **Role granularity**: Roles limited to owner/admin/member/viewer. Corporate requirements will need scoped permissions per feature (materials, analytics, extensions). Plan to extend `memberships.role` with capability matrix or separate `role_permissions` table.

## 2. Billing & Payments
- No billing tables beyond `organizations.plan`. Introduce new schema in Wave 1:
  - `subscriptions` (org_id, status, renewal_date, plan, payment_provider_id)
  - `invoices` (subscription_id, amount, currency, status, external_id, issued_at, paid_at)
  - `payment_events` (idempotency_key, event_type, payload, processed_at)
- Supabase Functions: create RPC for generating checkout session and verifying payment status. Keep provider-specific secrets outside repo (.env  secret manager).

## 3. Telegram Integration
- Bots: `main` bot handles auth and ingestion; `/api/telegram/notifications` suggests second bot for outbound notifications.
- Secret management: `.env` requires `TELEGRAM_WEBHOOK_SECRET`, `MAIN_TELEGRAM_BOT_TOKEN`, optionally `NOTIFICATION_BOT_TOKEN`. Recovery service resets webhook when header mismatch detected.
- Rate limiting: No throttle; rely on Telegram's own retries. Introduce middleware around `createTelegramService` for rate-limit/backoff and logging.
- Health: Add `telegram_health_events` table storing last success/failure with `update_id`, chat, and error code to power admin dashboards.

## 4. Database & Migrations
- Migrations live in `db/migrations/*.sql`. Initial schema sets up organizations, participants, events, materials, and analytics scaffolding. Later migrations consolidate Telegram identities, admin sync tables, and cleanup legacy audit columns.
- Index coverage: Many tables have indexes, but new ones (e.g., `telegram_group_admins`, `group_metrics`) rely on defaults. Audit query plans when adding analytics dashboards to avoid sequential scans.
- Soft delete: Some tables (e.g., `participants`) rely on `merged_into` column; no universal soft delete pattern. For audit trail, introduce `admin_action_log` with immutable entries.

## 5. CI/CD & Tooling
- Current scripts: `pnpm lint`, `pnpm build`, `pnpm dev`. No automated tests.
- GitHub/Vercel: Expect Vercel deployment with serverless functions; ensure environment variables set for service-role, Telegram tokens, Mailgun.
- Add GitHub Actions workflow running lint  new unit tests, upload coverage, and gate PRs.
- Observability stack: adopt Sentry (frontend  backend) and log drain (Supabase -> BigQuery or Logflare). For metrics, integrate Tinybird or Prometheus-compatible exporter using Vercel cron.

## 6. Marketplace Foundations
- Planned tables: `extensions`, `extension_versions`, `extension_permissions`, `extension_installations`.
- Execution model: Start with internal modules executed via cron/edge functions reading Supabase views. For external modules, expose event webhooks (Telegram activity, membership changes) and REST API with scoped keys.
- Security: Enforce per-extension scope matrix (accessible tables, actions). Provide sandbox environment for partners; require review pipeline.
