# Руководство по настройке Orbo

> **Версия:** 3.0 (Январь 2026)
> 
> Полная инструкция по развёртыванию и настройке Orbo.

## 📋 Требования

### Системные требования
- Node.js 20+
- Docker и Docker Compose (для production)
- PostgreSQL 16+ (или managed DB)

### Внешние сервисы
- **Selectel S3** - файловое хранилище
- **Telegram Bot** - интеграция с Telegram
- **OAuth провайдеры** - Google и/или Yandex
- **Email провайдер** - Unisender или Mailgun

---

## 🚀 Быстрый старт (Development)

### 1. Клонирование и установка

```bash
git clone <repository-url>
cd orbo-1.1
npm install
```

### 2. Настройка переменных окружения

```bash
cp deploy/env.example .env.local
```

Минимальные переменные для development:

```env
# Database (можно использовать Docker)
DATABASE_URL=postgresql://orbo:password@localhost:5432/orbo

# NextAuth
AUTH_SECRET=dev-secret-change-in-production
AUTH_URL=http://localhost:3000

# Telegram (получить от @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_name
TELEGRAM_WEBHOOK_SECRET=dev-secret

# Storage (Selectel S3)
STORAGE_PROVIDER=s3
SELECTEL_ENDPOINT=https://s3.storage.selcloud.ru
SELECTEL_BUCKET=orbo-materials
SELECTEL_ACCESS_KEY=your_access_key
SELECTEL_SECRET_KEY=your_secret_key
```

### 3. Запуск PostgreSQL (если нет локального)

```bash
docker run -d \
  --name orbo-postgres \
  -e POSTGRES_USER=orbo \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=orbo \
  -p 5432:5432 \
  postgres:16
```

### 4. Применение миграций

```bash
npm run db:migrate
# или вручную: psql -f db/migrations/*.sql
```

### 5. Запуск dev сервера

```bash
npm run dev
```

Откройте http://localhost:3000

---

## 🏗️ Production Deployment

### Docker Compose (рекомендуется)

```bash
cd deploy
cp env.example .env
# Отредактируйте .env
docker compose up -d
```

Подробная инструкция: `deploy/STEP_BY_STEP_GUIDE.md`

---

## 🔧 Настройка компонентов

### 1. PostgreSQL Database

#### Selectel Managed Database (рекомендуется для России)

1. Создайте PostgreSQL в панели Selectel
2. Получите connection string
3. Установите в `.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/orbo?sslmode=require
```

#### Self-hosted PostgreSQL

```bash
# В docker-compose уже включён PostgreSQL
docker compose up -d postgres
```

### 2. NextAuth.js (Авторизация)

#### Google OAuth

1. Откройте [Google Cloud Console](https://console.developers.google.com/)
2. Создайте проект или выберите существующий
3. APIs & Services → Credentials → Create OAuth Client ID
4. Application type: Web application
5. Authorized redirect URIs: `https://your-domain.ru/api/auth/callback/google`
6. Скопируйте Client ID и Client Secret

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

#### Yandex OAuth

1. Откройте [Yandex OAuth](https://oauth.yandex.ru/)
2. Создайте новое приложение
3. Тип: Веб-сервисы
4. Redirect URI: `https://your-domain.ru/api/auth/callback/yandex`
5. Права: `login:email`, `login:info`, `login:avatar`

```env
YANDEX_CLIENT_ID=xxx
YANDEX_CLIENT_SECRET=xxx
```

#### Auth Secret

```bash
# Генерация секрета
openssl rand -base64 32
```

```env
AUTH_SECRET=your_generated_secret
AUTH_URL=https://your-domain.ru
AUTH_TRUST_HOST=true
```

### 3. Selectel S3 Storage

1. Зайдите в [my.selectel.ru](https://my.selectel.ru)
2. Объектное хранилище → Создать контейнер
3. Тип: Публичный
4. Создайте сервисного пользователя для S3 доступа
5. Получите Access Key и Secret Key

```env
STORAGE_PROVIDER=s3
SELECTEL_ACCESS_KEY=your_access_key
SELECTEL_SECRET_KEY=your_secret_key
SELECTEL_BUCKET=orbo-materials
SELECTEL_ENDPOINT=https://s3.storage.selcloud.ru
SELECTEL_REGION=ru-1
SELECTEL_PUBLIC_URL_BASE=https://your-container-id.selstorage.ru
```

### 4. Telegram Bot

1. Напишите [@BotFather](https://t.me/BotFather) в Telegram
2. Создайте нового бота: `/newbot`
3. Получите токен

```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_name
```

4. Настройте webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-domain.ru/api/telegram/webhook" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

### 5. Email (Unisender)

1. Зарегистрируйтесь на [Unisender](https://www.unisender.com/)
2. Получите API ключ

```env
EMAIL_PROVIDER=unisender
UNISENDER_API_KEY=your_api_key
UNISENDER_FROM_EMAIL=noreply@your-domain.ru
UNISENDER_FROM_NAME=Orbo
```

---

## 🔍 Проверка работоспособности

### Health Check

```bash
curl https://your-domain.ru/api/health
```

Ожидаемый ответ:
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "0.1.0"
}
```

### Telegram Webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

---

## 🚨 Решение проблем

### Проблема: Database connection failed

**Причина:** Неверный DATABASE_URL или БД недоступна

**Решение:**
1. Проверьте формат URL: `postgresql://user:pass@host:port/db`
2. Проверьте доступность хоста: `psql $DATABASE_URL`
3. Проверьте SSL: добавьте `?sslmode=require` если нужно

### Проблема: OAuth redirect mismatch

**Причина:** Redirect URI не совпадает с настроенным в OAuth провайдере

**Решение:**
1. Проверьте AUTH_URL в .env
2. Добавьте правильный redirect URI в Google/Yandex консоли
3. Формат: `https://your-domain.ru/api/auth/callback/google`

### Проблема: Storage upload failed

**Причина:** Неверные credentials или права доступа

**Решение:**
1. Проверьте Access Key и Secret Key
2. Убедитесь что bucket существует
3. Проверьте права сервисного пользователя

### Проблема: Telegram webhook not receiving

**Причина:** Webhook не настроен или URL недоступен

**Решение:**
1. Проверьте webhook: `getWebhookInfo`
2. URL должен быть HTTPS
3. Проверьте secret_token совпадает с TELEGRAM_WEBHOOK_SECRET

---

## 📚 Дополнительная документация

- `deploy/STEP_BY_STEP_GUIDE.md` - Пошаговый деплой
- `docs/COMPREHENSIVE_PRD.md` - Полное описание проекта
- `docs/ARCHITECTURE.md` - Архитектура системы

---

**Дата обновления:** Январь 2026
