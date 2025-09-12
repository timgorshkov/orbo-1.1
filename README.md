# Orbo - Telegram Community Platform

Orbo - это платформа для управления Telegram-сообществами с функциями отслеживания участников, управления контентом и организации мероприятий.

## Технологический стек

- **Frontend**: Next.js 14 (App Router) + TypeScript + TailwindCSS
- **Backend**: Next.js API Routes, Server Actions
- **Database/Auth/Storage**: Supabase (Postgres, Auth, Storage)
- **Real-time**: Supabase Realtime
- **Telegram Integration**: Webhook API

## Настройка проекта для разработки

### Предварительные требования

- Node.js v18+
- npm v9+
- Аккаунт Supabase
- Telegram Bot (для полной функциональности)

### Настройка окружения

1. Клонируйте репозиторий:
   ```
   git clone https://github.com/your-username/orbo.git
   cd orbo
   ```

2. Установите зависимости:
   ```
   npm install
   ```

3. Создайте файл `.env.local` на основе `.env.example`:
   ```
   cp .env.example .env.local
   ```

4. Настройте Supabase:
   - Создайте проект в [Supabase](https://supabase.com)
   - Добавьте полученные ключи в `.env.local`
   - Выполните миграцию базы данных из файла `db/deploy.sql` через SQL Editor в Supabase Dashboard

5. Настройте Telegram Bot (опционально для разработки):
   - Создайте бота через [BotFather](https://t.me/BotFather)
   - Добавьте полученный токен в `.env.local`

6. Запустите проект в режиме разработки:
   ```
   npm run dev
   ```

## Деплой на Vercel

### Настройка Supabase для production

1. Создайте production проект в Supabase
2. Выполните миграцию базы данных из `db/deploy.sql` через SQL Editor
3. Создайте bucket `materials` в Storage для файлов
4. Настройте RLS политики для bucket (или используйте готовые из SQL)

### Настройка Vercel

1. Импортируйте проект из репозитория в Vercel:
   ```
   https://vercel.com/new
   ```

2. Добавьте переменные окружения в проект:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `TELEGRAM_WEBHOOK_URL` (https://your-app.vercel.app/api/telegram/webhook)
   - `JWT_SECRET`
   - `NEXT_PUBLIC_APP_URL` (https://your-app.vercel.app)

3. Деплой проекта:
   - Vercel автоматически задеплоит проект при каждом пуше в ветку main

### Настройка Telegram Webhook

После деплоя проекта, настройте webhook для Telegram бота:

1. Откройте в браузере URL:
   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={TELEGRAM_WEBHOOK_URL}&secret_token={TELEGRAM_WEBHOOK_SECRET}
   ```
   Замените переменные на ваши значения.

2. Проверьте статус webhook:
   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo
   ```

## Полезные команды

- `npm run dev` - запуск проекта в режиме разработки
- `npm run build` - сборка проекта для production
- `npm run start` - запуск production сборки
- `npm run lint` - проверка кода с помощью ESLint

## Мониторинг и обслуживание

- Проверка здоровья системы: `https://your-app.vercel.app/healthz`
- Логи: доступны в Vercel Dashboard
- База данных: управление через Supabase Dashboard

## Лицензия

[MIT](LICENSE)
