# Runbook — Orbo 1.1

## 1. Local Development
1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Environment variables** — copy `.env.example` to `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `MAIN_TELEGRAM_BOT_TOKEN`
   - `NOTIFICATION_BOT_TOKEN` (optional)
   - `MAILGUN_API_KEY` / `MAILGUN_DOMAIN` (optional)
3. **Supabase setup**
   - Ensure Supabase project created; run migrations with the Supabase CLI or via SQL editor (`db/migrations/*.sql` in order).
   - Seed demo data using `db/demo_data.sql` if needed.
4. **Start dev server**
   ```bash
   pnpm dev
   ```
   App runs on `http://localhost:3000`.
5. **Telegram webhook (local)**
   - Use `ngrok http 3000` and set webhook via Telegram: `https://api.telegram.org/bot<token>/setWebhook?url=<ngrok>/api/telegram/webhook&secret_token=...`.
   - For notification bot, configure `/api/telegram/notifications` accordingly.

## 2. Testing & Quality Gates
- **Lint**: `pnpm lint` (Next.js ESLint). Add `pnpm test` once unit tests are introduced.
- **Smoke Tests (planned)**: Playwright script covering Telegram onboarding wizard and event QR check-in.
- **CI Recommendation**: GitHub Actions workflow running lint  tests on PR; require green build before merge.

## 3. Deployment
1. **Vercel (recommended)**
   - Connect repo, configure environment variables in Vercel dashboard.
   - Set `NEXT_PUBLIC_APP_URL` to production hostname for dashboard fetches.
   - Configure Vercel Cron to hit `/api/cron/check-webhook` (every 10 min) and `/api/cron/sync-users` (hourly).
2. **Supabase**
   - Apply migrations via Supabase CLI or SQL editor. Keep changelog in repo.
   - Enable log drains (BigQuery/Logflare) for observability once implemented.
3. **Telegram Bots**
   - Keep `MAIN_TELEGRAM_BOT_TOKEN` and `NOTIFICATION_BOT_TOKEN` rotated via secret manager.
   - Re-run webhook setup after each deployment or secret rotation (use `/docs/TELEGRAM_WEBHOOK_SETUP.md`).

## 4. Operations
- **Healthchecks**: `/api/healthz` (basic) and `/api/health` (detailed). Integrate with uptime monitor.
- **Cron Jobs**: Trigger via Vercel cron or external scheduler. Ensure logs captured for success/failure.
- **Incident Response**:
  - Review structured logs (planned) or Vercel function logs.
  - Use Supabase SQL editor to inspect `telegram_group_admins`, `group_metrics`, and `telegram_auth_codes` for debugging.
  - Document remediation steps in `/docs/Audit.md` after incidents.
- **Backups**: Supabase offers automatic backups. Validate retention and test restore quarterly.

## 5. Environment Matrix
| Environment | Supabase Project | Telegram Bots | Mailgun | Notes |
| --- | --- | --- | --- | --- |
| Local | Self-hosted / Dev project | Optional test bot | Optional sandbox | Use ngrok for webhook |
| Staging | Supabase staging | Dedicated staging bot | Sandbox domain | Enable verbose logging |
| Production | Supabase prod | Main  notification bots | Production domain | Restrict service-role key access |

## 6. On-call Checklist (future)
- Dashboard alert triggered → confirm webhook status, check `telegram_health_events` table (once added).
- Payment reconcile failure → inspect `payment_events` DLQ (Wave 1 addition).
- Marketplace issue → disable extension via `extension_installations.status`.
