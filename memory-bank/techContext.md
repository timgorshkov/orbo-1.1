# Technical Stack (Updated February 2026)

## Frontend
- Next.js 14 (App Router) + TypeScript + TailwindCSS
- Deployed on Selectel Cloud (Docker)

## Backend
- Next.js API routes, server actions
- Cron jobs via internal scheduler

## Database
- **PostgreSQL 16** (Selectel server, Docker container)
- Direct connection via `pg` (node-postgres) library
- No RLS - access control implemented in application code
- 200+ migrations in `db/migrations/`
- Connection: individual params (POSTGRES_PASSWORD, DB_HOST, DB_PORT, DB_USER, DB_NAME)
- Abstraction: `lib/db/postgres-client.ts` ? `PostgresDbClient` with chainable query builder

## Authentication
- **NextAuth.js v5** with JWT session strategy
- OAuth providers: Google, Yandex
- Email magic links via Unisender
- Telegram 6-digit codes for participants
- Unified auth layer: `lib/auth/unified-auth.ts`
- PostgresAdapter for NextAuth session/account storage

## Storage
- **Selectel S3** (sole provider)
- `@aws-sdk/client-s3` for operations
- Abstraction: `lib/storage/s3-storage.ts`
- Bucket: configured via `S3_BUCKET_NAME` env var

## Telegram Integration
- 3 bots: @orbo_community_bot, @orbo_assistant_bot, @orbo_event_bot
- Webhooks at `/api/telegram/webhook`, `/api/telegram/notifications/webhook`, `/api/telegram/event-bot/webhook`
- grammY-style handlers in Next.js API routes

## Key Libraries
- `@auth/core` - NextAuth.js
- `@aws-sdk/client-s3` - S3 storage
- `pg` - PostgreSQL client
- `jose` - JWT handling
- `zod` - Schema validation
- `pino` - Structured logging
- `sharp` - Image processing

## Environment Variables (Key)
```env
POSTGRES_PASSWORD=...
DB_HOST=postgres
DB_PORT=5432
DB_USER=orbo
DB_NAME=orbo
AUTH_SECRET=...
NEXTAUTH_URL=https://my.orbo.ru
SELECTEL_ACCESS_KEY=...
TELEGRAM_BOT_TOKEN=...
```

## Deployment
- Selectel VPS (2 CPU, 4GB RAM, 40GB SSD)
- Docker Compose: app (Next.js) + postgres (PostgreSQL 16)
- Nginx reverse proxy with SSL (Let's Encrypt)
- Domain: my.orbo.ru

## Legacy (to be migrated to API routes)
- `lib/client/supabaseClient.ts` - stub, returns dummy client (2 pages still import it)
  - `app/p/[org]/telegram/groups/[id]/page.tsx`
  - `app/app/[org]/telegram/message/page.tsx`
  These pages need to be migrated to use fetch('/api/...') calls

## NOTE: Supabase Fully Removed (February 2026)
- All Supabase packages (`@supabase/ssr`, `supabase`) removed from package.json
- All Supabase client files deleted (`lib/db/supabase-client.ts`, `lib/auth/supabase-auth.ts`, `lib/storage/supabase-storage.ts`)
- All server-side code uses PostgresDbClient via `lib/db/postgres-client.ts`
- `lib/server/supabaseServer.ts` is a thin wrapper that returns PostgresDbClient (kept for import compatibility)
- `tsconfig.json` has `noImplicitAny: false` due to PostgresDbClient returning untyped data
- `next.config.js` has `typescript.ignoreBuildErrors: true` for the same reason
