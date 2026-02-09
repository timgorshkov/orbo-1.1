# Runbook — Orbo 1.1

> **Обновлено:** 9 февраля 2026  
> **Стек:** Next.js 15, PostgreSQL 16, Selectel S3, NextAuth.js v5  
> **Сервер:** Selectel VPS, Docker Compose

## 1. Local Development
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Environment variables** — copy `.env.example` to `.env.local` and fill:
   - `POSTGRES_HOST=localhost`
   - `POSTGRES_PORT=5432`
   - `POSTGRES_DB=orbo`
   - `POSTGRES_USER=orbo`
   - `POSTGRES_PASSWORD=password`
   - `AUTH_SECRET=dev-secret`
   - `NEXTAUTH_URL=http://localhost:3000`
   - `TELEGRAM_BOT_TOKEN_MAIN=your_bot_token`
   - `TELEGRAM_WEBHOOK_SECRET=dev-secret`
   - `CRON_SECRET=dev-cron-secret`
   - `STORAGE_PROVIDER=s3`
   - `SELECTEL_ENDPOINT`, `SELECTEL_BUCKET`, `SELECTEL_ACCESS_KEY`, `SELECTEL_SECRET_KEY`
   - `OPENAI_API_KEY` (optional, for AI features)
3. **PostgreSQL setup**
   ```bash
   # Start PostgreSQL with Docker
   docker run -d --name orbo-postgres \
     -e POSTGRES_USER=orbo -e POSTGRES_PASSWORD=password -e POSTGRES_DB=orbo \
     -p 5432:5432 postgres:16
   
   # Apply migrations in order
   for f in db/migrations/*.sql; do psql -U orbo -d orbo -f "$f"; done
   ```
4. **Start dev server**
   ```bash
   npm run dev
   ```
   App runs on `http://localhost:3000`.
5. **Telegram webhook (local)**
   - Use `ngrok http 3000` and set webhook via Telegram:
   ```
   https://api.telegram.org/bot<token>/setWebhook?url=<ngrok>/api/telegram/webhook&secret_token=...
   ```

## 2. Testing & Quality Gates
- **Lint**: `npm run lint` (Next.js ESLint)
- **Build**: `npm run build` (TypeScript check + Next.js build)
- **Smoke Tests (planned)**: Playwright script covering Telegram onboarding and event QR check-in

## 3. Deployment

### Production (Selectel VPS + Docker Compose)

Подробные инструкции: **[OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md)**

Краткий процесс:
```bash
# 1. Скопировать файлы на сервер
scp -r <project-files> deploy@selectel-orbo:~/orbo/

# 2. SSH на сервер
ssh selectel-orbo

# 3. Пересобрать и запустить
cd ~/orbo
docker compose build app && docker compose up -d app

# 4. Применить новые миграции (если есть)
docker exec -i orbo_postgres psql -U orbo -d orbo < db/migrations/NEW_MIGRATION.sql

# 5. Проверить
docker compose logs --tail=50 app
curl -s https://my.orbo.ru/api/health
```

### Telegram Bots
- Секреты хранятся в `.env` на сервере
- После деплоя webhook автоматически восстанавливается (auto-recovery)
- Ручная переустановка: см. `/docs/TELEGRAM_WEBHOOK_SETUP.md`

## 4. Operations
- **Healthchecks**: `/api/healthz` (liveness), `/api/health` (detailed). Проверяется Nginx upstream.
- **Cron Jobs**: Запускаются через внешний cron (`/etc/cron.d/orbo-cron`):
  - `check-notification-rules` — каждые 5 минут
  - `sync-attention-zones` — каждые 15 минут
  - `check-groups-health` — каждый час
  - `send-announcements` — каждую минуту
  - `update-group-metrics` — каждый час
  - `send-digests` — каждые 3 часа
- **Incident Response**:
  - Просмотр логов: `docker compose logs --tail=200 app | grep -i error`
  - SQL-отладка: `docker exec -it orbo_postgres psql -U orbo -d orbo`
  - Ошибки в суперадминке: https://my.orbo.ru/superadmin/errors
- **Backups**: Автоматические бэкапы PostgreSQL через cron (ежедневно). Хранение 7 дней.

## 5. Environment Matrix
| Environment | Database | Telegram Bots | Storage | Notes |
| --- | --- | --- | --- | --- |
| Local | Docker PostgreSQL 16 | Optional test bot | Selectel S3 | Use ngrok for webhook |
| Production | Docker PostgreSQL 16 (Selectel VPS) | 3 production bots | Selectel S3 | SSH: `selectel-orbo` |

## 6. Key URLs
| URL | Описание |
| --- | --- |
| https://my.orbo.ru | Production (приложение) |
| https://orbo.ru | Landing page |
| https://my.orbo.ru/api/health | Health check |
| https://my.orbo.ru/superadmin | Суперадмин-панель |

## 7. On-call Checklist
- Alert triggered → check `docker compose logs app`, verify webhook status
- DB issues → check `docker compose logs postgres`, verify connection
- High memory → `docker stats --no-stream`, `free -h`, consider `docker system prune`
- Notification failures → check `notification_logs` table, verify bot token validity
