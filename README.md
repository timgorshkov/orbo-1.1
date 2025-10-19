# Orbo - Community Management Platform

> Платформа для управления образовательными и коммьюнити-пространствами с глубокой интеграцией с Telegram

## 🚀 Быстрый старт

### Для разработчиков

```bash
# Клонировать репозиторий
git clone <repository-url>
cd orbo-1.1

# Установить зависимости
npm install

# Настроить переменные окружения
cp .env.example .env.local
# Заполните .env.local вашими ключами

# Запустить dev сервер
npm run dev
```

### Для тестирования с нуля

После подчистки проекта и очистки БД:

1. **Откройте:** `https://app.orbo.ru`
2. **Зарегистрируйтесь** через email
3. **Создайте организацию**
4. **Настройте Telegram** (привязка аккаунта)
5. **Подключите Telegram группу**
6. **Создайте контент** (события, материалы)

Подробнее: [`docs/PROJECT_CLEANUP_COMPLETE.md`](docs/PROJECT_CLEANUP_COMPLETE.md)

## 📚 Документация

### Основные документы

- **[Comprehensive PRD](docs/COMPREHENSIVE_PRD.md)** - Полное описание проекта (14,000+ слов)
  - Архитектура системы
  - Все модули и функциональность
  - Схема базы данных
  - Роли и права доступа
  - Интеграции и deployment
  - Roadmap

- **[Cleanup Instructions](docs/CLEANUP_INSTRUCTIONS.md)** - Очистка БД для тестирования
  - SQL скрипты
  - Пошаговые инструкции
  - Проверка результатов

- **[Project Cleanup Complete](docs/PROJECT_CLEANUP_COMPLETE.md)** - Итоги подчистки проекта
  - Что сделано
  - Как тестировать
  - Чек-листы проверки

- **[Original PRD](prd.md)** - Оригинальное техническое задание

### Дополнительная документация

Все документы организованы в папке [`docs/`](docs/):

**Setup:**
- `SETUP_GUIDE.md` - Руководство по установке
- `MAILGUN_SETUP.md` - Настройка email сервиса
- `TELEGRAM_BOT_SETUP.md` - Настройка Telegram ботов

**Features:**
- `PROFILE_PAGE_IMPLEMENTATION.md` - Страница профиля пользователя
- `ORGANIZATION_TEAM_IMPROVEMENTS.md` - Управление командой
- `TELEGRAM_ADMIN_SYNC_LOGIC_EXPLANATION.md` - Логика синхронизации админов

**Database:**
- `DATABASE_ANALYSIS.md` - Анализ базы данных
- `DATABASE_CLEANUP_SUMMARY.md` - Очистка неиспользуемых таблиц
- `MIGRATIONS_42_49_ORDER.md` - Порядок применения миграций

И многое другое...

## 🏗️ Архитектура

### Технологический стек

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- TailwindCSS

**Backend:**
- Next.js API Routes
- Supabase (PostgreSQL + Auth + Storage)
- Vercel (Hosting)

**Интеграции:**
- Telegram Bot API (2 бота)
- Mailgun (Email)

### Структура проекта

```
orbo-1.1/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Auth pages (signin, signup)
│   ├── api/                # API routes
│   ├── app/[org]/          # Organization pages (protected)
│   ├── p/[org]/            # Public pages
│   └── ...
├── components/             # React components
├── lib/                    # Utilities
│   ├── services/           # Services (Telegram, Email, etc)
│   ├── server/             # Server-side utils
│   └── ...
├── db/                     # Database
│   ├── migrations/         # SQL migrations (01-51)
│   └── ...
├── docs/                   # Documentation
├── public/                 # Static assets
├── prd.md                  # Original PRD
└── README.md               # This file
```

## 🎯 Ключевые возможности

### ✅ Реализовано

- **Авторизация:**
  - Email (magic link)
  - Telegram коды (для участников групп)
  - Теневые профили (автосоздание из Telegram админов)

- **Организации:**
  - Мультиорганизационность (один пользователь → много организаций)
  - Гибкая система ролей (Owner/Admin/Member)
  - Управление командой (автосинхронизация Telegram админов)

- **Telegram интеграция:**
  - Подключение групп (автоматически или вручную)
  - Автоматический импорт участников
  - Синхронизация администраторов
  - Аналитика активности

- **Участники:**
  - Умное слияние дубликатов (fuzzy matching)
  - Автозагрузка фото из Telegram
  - Детальные профили с custom attributes

- **События:**
  - Создание, регистрация
  - Публичные ссылки (share tokens)
  - ICS файлы (импорт в календарь)

- **База знаний:**
  - Иерархическая структура (древовидная)
  - Markdown редактор
  - Вставка видео (YouTube, VK)

- **Аналитика:**
  - Dashboard с виджетами
  - Статистика по группам
  - Activity графики
  - Зоны внимания

- **Профили:**
  - Единая страница профиля
  - Управление Telegram аккаунтом
  - Активация теневых профилей

### 🚧 В разработке

- Email уведомления (события, приглашения)
- Улучшенная аналитика (retention, engagement)
- Экспорт данных (CSV, Excel)

### 📝 Запланировано

- Автоматизация (welcome messages, reminders)
- Интеграция с календарями (Google Calendar)
- Сертификаты и бейджи
- Опросы и квизы
- Mobile app

## 🛠️ Разработка

### Требования

- Node.js 18+
- npm или yarn
- Supabase account
- Telegram Bot tokens (2 бота)
- Mailgun account

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_NOTIFICATIONS_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Email
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
```

### Команды

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start

# Lint
npm run lint
```

### База данных

**Миграции:** `db/migrations/` (51 миграция)

**Применение:**
1. Откройте Supabase SQL Editor
2. Выполните миграции по порядку (01-51)
3. Проверьте статус

**Очистка для тестирования:**
```bash
# Используйте скрипт
db/CLEANUP_ALL_DATA.sql
```

## 🚀 Deployment

### Vercel

**Автоматический деплой:**
- Push в `main` → автодеплой на `app.orbo.ru`

**Ручной деплой:**
```bash
vercel deploy --prod
```

### Supabase

**Регион:** Frankfurt (EU Central)

**Миграции:** Применяются вручную через SQL Editor

### Telegram Webhooks

**Setup:**
```bash
# Main bot
curl -X POST \
  https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://app.orbo.ru/api/telegram/webhook \
  -d secret_token=<SECRET>

# Notifications bot
curl -X POST \
  https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://app.orbo.ru/api/telegram/notifications/webhook
```

## 📊 Мониторинг

- **Vercel Dashboard:** Логи и метрики
- **Supabase Dashboard:** БД логи и метрики
- **Telegram Bot API:** Webhook статус

## 🤝 Разработка

### Workflow

1. Создать feature branch
2. Внести изменения
3. Протестировать локально
4. Commit с понятным сообщением
5. Push и создать PR
6. Code review
7. Merge в `main`
8. Автодеплой на production

### Стандарты кода

- **TypeScript** - строгая типизация
- **ESLint** - линтинг
- **Prettier** - форматирование (планируется)
- **Naming conventions:**
  - Components: PascalCase
  - Functions: camelCase
  - Files: kebab-case

### Миграции БД

**Создание новой миграции:**
1. Создать файл `db/migrations/XX_description.sql`
2. Добавить SQL код
3. Протестировать на dev окружении
4. Применить на production

**Нумерация:** Последовательная (52, 53, 54...)

## 📝 Лицензия

Proprietary - Все права защищены

## 📧 Контакты

- **Email:** support@orbo.ru
- **Telegram:** @orbo_support
- **GitHub:** [repository]

---

**Версия:** 2.0  
**Последнее обновление:** 20 января 2025

Made with ❤️ by Orbo Team
