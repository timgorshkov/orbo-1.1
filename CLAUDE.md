# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run lint      # ESLint check
npm start         # Start production server
```

No automated tests exist in this project.

To apply DB migrations in production:
```bash
cd deploy && ./scripts/migrate-database.sh
```

## Architecture Overview

**Orbo** is a B2B SaaS platform for managing Telegram communities and educational spaces. Users create organizations, connect Telegram groups, and manage members, events, materials, and analytics from a web dashboard.

### Domain Routing (middleware.ts)

Two domains handled by a single Next.js app:
- `orbo.ru` / `www.orbo.ru` — public website, rewrites to `/app/site/`
- `my.orbo.ru` / `app.orbo.ru` — SaaS app, protected routes require auth

Authentication check in middleware is cookie-based only (no DB call), actual session validation happens inside route handlers.

### Route Structure

```
app/
  (auth)/           # /signin, /signup pages
  app/[org]/        # Main app — all protected org pages
    dashboard/      # Analytics widgets (Recharts)
    events/         # Event management + registration
    members/        # Team (org members with roles)
    participants/   # CRM: Telegram community members
    materials/      # Knowledge base (Tiptap editor, tree structure)
    telegram/       # Telegram groups management
    settings/       # Org settings, invites
    subscriptions/  # Billing & plan management
    apps/           # Mini-app catalog
  p/[org]/          # Public-facing pages (events, materials)
  tg-app/           # Telegram Mini App (WebApp)
  site/             # Public website (orbo.ru)
  superadmin/       # Internal admin panel
  api/              # All API route handlers
    cron/           # Background jobs (15+ scheduled tasks)
    telegram/       # Telegram webhook + bot API
    ai/             # OpenAI-powered features
    billing/        # Plans, payments, subscriptions
```

### Database Layer

The project was migrated from Supabase to direct PostgreSQL in January 2026. The legacy file `lib/server/supabaseServer.ts` is kept for backwards compatibility (180+ import sites) but now returns a PostgreSQL client.

**Always use `createAdminServer()` from `@/lib/server/supabaseServer`** — this is the standard pattern across the codebase:
```typescript
import { createAdminServer } from '@/lib/server/supabaseServer';
const db = createAdminServer();
const { data, error } = await db.from('table').select('*').eq('id', id).single();
```

The query builder (`lib/db/postgres-client.ts`) mimics Supabase's chainable API but has a critical limitation: **Supabase-style JOIN syntax does not work**:
```typescript
// ❌ DOES NOT WORK — will produce incorrect SQL
db.from('events').select('id, organizations(name)')

// ✅ Use raw SQL for JOINs
db.raw('SELECT e.id, o.name FROM events e JOIN organizations o ON ...', [params])
```

For complex queries, always use `db.raw(sql, params)`.

**DB connection config** (in order of priority):
1. Individual env vars: `POSTGRES_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`
2. Connection string: `DATABASE_URL_POSTGRES` or `DATABASE_URL`

**Migrations**: Sequential SQL files in `db/migrations/` (e.g. `58_description.sql`). Number sequentially from the last existing file.

### Authentication

NextAuth.js v5 with JWT strategy. Providers: Google OAuth, Yandex OAuth (custom), Email magic link (custom, handled directly in `/api/auth/email/verify`).

Session user ID is accessed via:
```typescript
import { auth } from '@/auth';
const session = await auth();
const userId = session?.user?.id;
```

**Access control** — always use `getEffectiveOrgRole` for org-level permission checks:
```typescript
import { getEffectiveOrgRole } from '@/lib/server/orgAccess';
const role = await getEffectiveOrgRole(userId, orgId);
// Returns { role: 'owner'|'admin'|'member', isSuperadmin: boolean } or null
```

Superadmins get virtual `owner` role in any org without a real membership row.

Shadow profiles: Telegram admins without an Orbo account get auto-created user records (`is_shadow_profile = true`), activated when they sign up.

### Logging

Use `createServiceLogger` everywhere — do not use `console.log`:
```typescript
import { createServiceLogger } from '@/lib/logger';
const logger = createServiceLogger('MyService');
logger.info({ key: value }, 'Human-readable message');
logger.error({ error: err.message }, 'Something failed');
```

### Telegram Integration

- Bot library: `grammy`
- Webhook endpoint: `/api/telegram/webhook`
- Main service: `lib/services/telegramService.ts`
- Auth for Telegram Mini App (WebApp): `lib/telegram/webAppAuth.ts`
- Bot handles group events, member syncing, 6-digit auth codes, and registration flows

### Key Services (lib/services/)

| Service | Purpose |
|---|---|
| `telegramService.ts` | Core Telegram group/member operations |
| `billingService.ts` | Subscription plans, feature gating |
| `openaiClient.ts` | OpenAI wrapper for AI features |
| `participantEnrichmentService.ts` | Fuzzy-match deduplication, Telegram photo sync |
| `webhookProcessingService.ts` | Telegram webhook event processing |
| `emailService.ts` | Transactional email (Unisender/Mailgun) |
| `onboardingChainService.ts` | Post-signup onboarding email sequences |

### Database Schema

Migrations live in `db/migrations/` (230+ files). Key tables:

#### Auth & Users
| Table | Purpose |
|---|---|
| `users` | Accounts (NextAuth-compatible, replaces Supabase `auth.users`) |
| `accounts` | Linked OAuth providers per user (Google, Yandex, Telegram) |
| `verification_tokens` | Email magic link tokens |
| `superadmins` | Platform-level admin access (`is_active` flag) |

#### Organizations & Access
| Table | Purpose |
|---|---|
| `organizations` | Orgs (`id`, `name`, `plan`, `slug`) |
| `memberships` | User↔Org binding, `role`: `owner`/`admin`/`member` |
| `org_subscriptions` | Active billing plan per org (`plan_code`, `status`, `expires_at`) |
| `billing_plans` | Plan catalog (`free`/`pro`/`enterprise`), limits/features in JSONB |
| `org_invoices` | Payment transaction log |

#### Telegram
| Table | Purpose |
|---|---|
| `telegram_groups` | Connected TG groups (`tg_chat_id`, `bot_status`, `org_id`) |
| `telegram_channels` | Connected TG channels |
| `telegram_group_admins` | Synced admin list per group |
| `user_telegram_accounts` | Verified TG accounts per user (`is_verified`) |
| `telegram_auth_codes` | 6-digit login codes for TG-based auth |
| `activity_events` | Raw TG events: `join`/`leave`/`message`/`checkin` |
| `participant_messages` | Message history per participant per group |

#### Participants (CRM)
| Table | Purpose |
|---|---|
| `participants` | Community members (`tg_user_id`, `full_name`, `user_id`, `merged_into`) |
| `participant_groups` | Participant↔Group membership (`joined_at`, `left_at`) |

Key fields on `participants`:
- `merged_into uuid` — if set, this record is a duplicate merged into another
- `is_shadow_profile bool` — user created from TG admin sync, not yet signed up
- `user_id uuid` — set when participant links to a real Orbo user account
- `score int` — engagement score, computed by `participantStatsService`
- `custom_attributes jsonb` — org-specific extra fields

#### Events
| Table | Purpose |
|---|---|
| `events` | Events (`starts_at`, `ends_at`, `visibility`, `capacity`) |
| `event_registrations` | Registrations (`status`: `invited`/`registered`/`checked_in`, `qr_token`) |
| `event_registration_fields` | Custom form fields per event |

#### Materials (Knowledge Base)
| Table | Purpose |
|---|---|
| `material_folders` | Tree hierarchy (self-referential `parent_id`) |
| `material_items` | Content (`kind`: `doc`/`file`/`link`, `content` for docs, `file_path` for S3) |

#### Notifications & Automation
| Table | Purpose |
|---|---|
| `notification_rules` | Alert rules per org (`rule_type`: `negative_discussion`/`unanswered_question`/`group_inactive`) |
| `notification_logs` | Triggered notification history |
| `announcements` | Broadcast messages to TG groups |

#### Apps (Mini-apps)
| Table | Purpose |
|---|---|
| `apps` | AI-generated mini-apps per org (`config` JSONB) |
| `app_collections` | Data models within an app (`schema` JSONB with field definitions) |
| `app_items` | Records stored in a collection (`data` JSONB, flexible per schema) |
| `app_item_reactions` | Likes/votes on items |
| `app_item_comments` | Threaded comments on items |

#### Observability
| Table | Purpose |
|---|---|
| `error_logs` | Application errors (also sent to Hawk.so) |
| `ai_requests` | OpenAI call log (`tokens_used`, `cost_usd`, `org_id`) |
| `openai_api_logs` | Raw OpenAI API request/response log |
| `audit_log` | Admin action audit trail |

#### Important RPC Functions (PostgreSQL)
- `merge_participants_smart(source_id, target_id)` — merges duplicate participant records
- `get_enriched_participants(org_id, ...)` — main CRM query with scoring and filters
- `org_dashboard_stats(org_id)` — dashboard aggregate stats
- `get_engagement_breakdown(org_id, ...)` — analytics breakdown
- `webhook_processing_rpc(...)` — atomic Telegram webhook handling
- `register_for_event(...)` — atomic event registration with capacity check

### Deployment & Server Operations

#### How CI/CD Works

Push to `master` → GitHub Actions (`.github/workflows/deploy-selectel.yml`) автоматически:
1. Упаковывает код через `git archive` (без `.git`, без `node_modules`)
2. Копирует архив на сервер по SSH
3. Разворачивает в `/home/deploy/orbo/app/`, сохраняя предыдущую версию как `app_backup_YYYYMMDD_HHMMSS`
4. Запускает `docker build` + `docker compose up -d app`
5. Делает health check на `/api/health`, откатывается при неудаче
6. Хранит последние 3 бэкапа версий

Для ручного запуска деплоя: **Actions → Deploy to Selectel → Run workflow**.

**GitHub Secrets**, которые должны быть настроены в репозитории:
- `SELECTEL_SSH_KEY` — приватный SSH-ключ пользователя `deploy`

#### Server Layout

```
/home/deploy/orbo/
  app/                  # Текущая версия кода
  app_backup_*/         # Предыдущие версии (хранятся последние 3)
  .env                  # Все секреты (не в git)
  docker-compose.yml    # Конфигурация контейнеров
  nginx/nginx.conf      # Nginx конфиг
  data/postgres/        # Данные PostgreSQL (volume)
  backups/              # Дампы базы данных
  scripts/              # Скрипты обслуживания
  cron-*.sh             # Скрипты крон-задач
```

#### Docker Stack

Четыре контейнера (`docker-compose.yml` в папке `deploy/`):

| Контейнер | Образ | Назначение |
|---|---|---|
| `orbo_app` | Custom (Dockerfile) | Next.js приложение, порт 3000 (только localhost) |
| `orbo_postgres` | postgres:16-alpine | БД, порт 5432 (только localhost) |
| `orbo_nginx` | nginx:alpine | Reverse proxy, SSL termination, порты 80/443 |
| `orbo_certbot` | certbot/certbot | Автообновление Let's Encrypt сертификатов |
| `orbo_adminer` | adminer | Web UI для БД, порт 8080 (только localhost) |

#### Работа с сервером

SSH-подключение настраивается через `~/.ssh/config` (шаблон: `deploy/ssh-config-template.txt`). Пользователь `deploy`.

**Основные команды на сервере:**
```bash
cd ~/orbo

# Статус контейнеров
docker compose ps

# Логи приложения (live)
docker compose logs -f app

# Перезапуск приложения без пересборки
docker compose restart app

# Пересборка и перезапуск
docker compose build app && docker compose up -d app

# Логи крон-задач
tail -f /var/log/orbo-cron.log
```

**Adminer (web UI для PostgreSQL)** — доступен только через SSH tunnel:
```bash
# Пробросить порт локально
ssh -L 8080:localhost:8080 selectel-orbo
# Затем открыть http://localhost:8080
# Сервер: postgres, Пользователь: orbo, БД: orbo
```

**Прямой доступ к PostgreSQL:**
```bash
docker exec -it orbo_postgres psql -U orbo -d orbo
```

#### Миграции БД

Миграции применяются вручную — они не запускаются автоматически при деплое:
```bash
# На сервере
cd ~/orbo
docker exec -i orbo_postgres psql -U orbo -d orbo < app/db/migrations/XXX_name.sql
```

#### Резервное копирование и восстановление

```bash
# Создать бэкап (сохраняется в ~/orbo/backups/)
~/orbo/scripts/backup.sh

# Бэкап + загрузить в S3 Selectel
~/orbo/scripts/backup.sh --upload

# Восстановить из бэкапа
~/orbo/scripts/restore.sh

# Последние бэкапы (хранятся 7 дней)
ls -lh ~/orbo/backups/
```

Бэкапы автоматически создаются крон-задачей ежедневно в 3:00.

#### Крон-задачи на сервере

Крон вызывает API-эндпоинты приложения (все защищены заголовком `x-cron-secret` или `Authorization: Bearer`).

| Расписание | Эндпоинт |
|---|---|
| каждые 5 мин | `/api/cron/update-group-metrics` |
| каждые 15 мин | `/api/cron/check-notification-rules` |
| каждые 15 мин | `/api/cron/send-onboarding` |
| каждые 5 мин | `/api/cron/send-announcements` |
| каждый час | `/api/cron/sync-attention-zones` |
| каждый час | `/api/cron/send-event-reminders` |
| каждый час | `/api/cron/error-digest` |
| каждые 3 ч | `/api/cron/send-weekly-digests` |
| каждые 6 ч | `/api/cron/notification-health-check` |
| 9:00 ежедневно | `/api/cron/check-billing` |

Настройка крон-задач на сервере: `bash ~/orbo/scripts/setup-cron.sh`

### Environment Variables

Key vars needed for development:
```
DATABASE_URL or POSTGRES_PASSWORD + DB_HOST/PORT/USER/NAME
AUTH_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
NEXT_PUBLIC_APP_URL
```

Full list in `deploy/env.example`.
