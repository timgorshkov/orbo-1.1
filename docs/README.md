# Документация Orbo

Актуальная документация проекта.  
**Стек:** Next.js 15, PostgreSQL 16 (прямое подключение), Selectel S3, NextAuth.js v5  
**Последнее обновление:** 9 февраля 2026

## 📋 Оглавление

### 🚀 Начало работы
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** — полное руководство по развертыванию проекта
- **[OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md)** — деплой, SSH, работа с БД, troubleshooting
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — архитектура системы

### 📦 Продукт
- **[COMPREHENSIVE_PRD.md](./COMPREHENSIVE_PRD.md)** — Product Requirements Document (PRD)
- **[PRODUCT_FEATURES.md](./PRODUCT_FEATURES.md)** — описание функционала

### 🗺️ Роадмап
- **[ROADMAP_FEB_2026_ICP.md](./ROADMAP_FEB_2026_ICP.md)** — ⭐ **АКТИВНЫЙ РОАДМАП** — "События как конверсионный движок"
- **[ROADMAP_FEB_MAR_2026.md](./ROADMAP_FEB_MAR_2026.md)** — расширенный план Февраль-Март 2026

### 🤖 Telegram интеграция
- **[TELEGRAM_BOT_SETUP.md](./TELEGRAM_BOT_SETUP.md)** — настройка Telegram ботов
- **[TELEGRAM_WEBHOOK_SETUP.md](./TELEGRAM_WEBHOOK_SETUP.md)** — настройка вебхуков
- **[TELEGRAM_OWNERSHIP_ARCHITECTURE.md](./TELEGRAM_OWNERSHIP_ARCHITECTURE.md)** — архитектура владения группами
- **[TELEGRAM_ADMIN_SYNC_LOGIC_EXPLANATION.md](./TELEGRAM_ADMIN_SYNC_LOGIC_EXPLANATION.md)** — логика синхронизации админов
- **[SUPERADMIN_TELEGRAM_SETUP.md](./SUPERADMIN_TELEGRAM_SETUP.md)** — настройка суперадмин-бота

### 👥 Участники и CRM
- **[PARTICIPANT_SCORING_LOGIC.md](./PARTICIPANT_SCORING_LOGIC.md)** — автоматический скоринг участников
- **[AI_ENRICHMENT_FIELDS.md](./AI_ENRICHMENT_FIELDS.md)** — AI-обогащение профилей (OpenAI)
- **[MEMBER_INTERFACE_GUIDE.md](./MEMBER_INTERFACE_GUIDE.md)** — гайд по интерфейсу участников

### 📅 События
- **[specs/ANNOUNCEMENTS_SPEC.md](./specs/ANNOUNCEMENTS_SPEC.md)** — система анонсов
- **[PAYMENT_TRACKING_API.md](./PAYMENT_TRACKING_API.md)** — API оплаты событий
- **[PAYMENT_TRACKING_UI.md](./PAYMENT_TRACKING_UI.md)** — UI оплаты событий

### 🔔 Уведомления
- Правила уведомлений (AI-анализ негатива, неотвеченных вопросов)
- Attention zones (churning participants, inactive newcomers)
- Авто-решение уведомлений при появлении активности

### 🔧 DevOps и инфраструктура
- **[OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md)** — SSH, деплой, БД, Docker
- **[deploy/README.md](../deploy/README.md)** — файлы деплоя
- **[deploy/STEP_BY_STEP_GUIDE.md](../deploy/STEP_BY_STEP_GUIDE.md)** — пошаговый деплой с нуля
- **[Security_and_compliance.md](./Security_and_compliance.md)** — безопасность
- **[SUPABASE_MIGRATION_STATUS.md](./SUPABASE_MIGRATION_STATUS.md)** — статус миграции (✅ завершена)

### 📊 Аналитика и дашборд
- **[DASHBOARD_ATTENTION_ZONES_FIX.md](./DASHBOARD_ATTENTION_ZONES_FIX.md)** — логика дашборда и зон внимания

### 📱 Приложения
- **[ORBO_APPS_API.md](./ORBO_APPS_API.md)** — API приложений
- **[specs/APPS_CATALOG_SPEC.md](./specs/APPS_CATALOG_SPEC.md)** — спецификация каталога

### 📂 Архив
- **[archive/](./archive/)** — исторические документы (миграция Supabase, старые планы)

---

## 📂 Структура проекта

```
orbo-1.1/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (189+ файлов)
│   ├── p/[org]/            # Страницы организации (защищённые)
│   ├── tg-app/             # Telegram MiniApp
│   ├── superadmin/         # Суперадмин-панель
│   └── site/               # Лендинг orbo.ru
├── components/             # React компоненты
│   ├── ui/                 # Base UI (shadcn)
│   ├── events/             # Компоненты событий
│   ├── members/            # Компоненты участников
│   ├── dashboard/          # Дашборд
│   └── notifications/      # Уведомления
├── lib/
│   ├── auth/               # Auth utilities (NextAuth.js)
│   ├── db/                 # Database client (PostgreSQL)
│   ├── storage/            # Storage provider (Selectel S3)
│   ├── services/           # Бизнес-логика (30+ сервисов)
│   └── server/             # Server-side утилиты (orgGuard, orgAccess)
├── db/
│   └── migrations/         # SQL миграции (220+)
├── deploy/                 # Docker & deployment
├── docs/                   # Документация (вы здесь)
└── memory-bank/            # Memory Bank (задачи, контекст, архив)
```

---

## 🔗 Полезные ссылки

- **Production (приложение):** https://my.orbo.ru
- **Production (лендинг):** https://orbo.ru
- **Сервер:** Selectel VPS (SSH: `ssh selectel-orbo`)
- **Telegram Bots:**
  - `@orbo_community_bot` — управление группами, MiniApp
  - `@orbo_event_bot` — MiniApp регистрации на события
  - `@orbo_assist_bot` — системные уведомления

---

## 💡 Принципы работы с документацией

1. **Не создавать FIX-документы** для каждого бага — фиксить сразу в коде
2. **Не хранить промежуточные SUMMARY** — оставлять только финальные
3. **Устаревшие гайды удалять** — поддерживать один актуальный SETUP_GUIDE
4. **Архитектурные доки обновлять** при изменении логики
5. **Supabase полностью удалён** — не ссылаться на него в новых документах

---

**Последнее обновление:** 9 февраля 2026
