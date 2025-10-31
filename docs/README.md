# Документация Orbo

Актуальная документация проекта после радикальной чистки (февраль 2025).

## 📋 Оглавление

### 🚀 Начало работы
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** — полное руководство по развертыванию проекта
- **[COMPREHENSIVE_PRD.md](./COMPREHENSIVE_PRD.md)** — Product Requirements Document (PRD)

### 🤖 Telegram интеграция
- **[TELEGRAM_BOT_SETUP.md](./TELEGRAM_BOT_SETUP.md)** — настройка Telegram ботов
- **[TELEGRAM_WEBHOOK_SETUP.md](./TELEGRAM_WEBHOOK_SETUP.md)** — настройка вебхуков
- **[TELEGRAM_OWNERSHIP_ARCHITECTURE.md](./TELEGRAM_OWNERSHIP_ARCHITECTURE.md)** — архитектура владения группами
- **[TELEGRAM_ADMIN_SYNC_LOGIC_EXPLANATION.md](./TELEGRAM_ADMIN_SYNC_LOGIC_EXPLANATION.md)** — логика синхронизации админов
- **[TELEGRAM_CHAT_MIGRATION_GUIDE.md](./TELEGRAM_CHAT_MIGRATION_GUIDE.md)** — обработка миграции chat_id при создании супергрупп

### 👥 Участники и интерфейсы
- **[MEMBER_INTERFACE_GUIDE.md](./MEMBER_INTERFACE_GUIDE.md)** — гайд по интерфейсу участников

### 🗄️ База данных
- **[DATABASE_CLEANUP_COMPLETE_SUMMARY.md](./DATABASE_CLEANUP_COMPLETE_SUMMARY.md)** — итоговая сводка по очистке БД
- **[DATABASE_UNUSED_COLUMNS_AUDIT.md](./DATABASE_UNUSED_COLUMNS_AUDIT.md)** — аудит неиспользуемых колонок
- **[MIGRATION_42_CLEANUP_SUMMARY.md](./MIGRATION_42_CLEANUP_SUMMARY.md)** — сводка по очистке после миграции 42

### 👥 Участники
- **[PARTICIPANT_SCORING_LOGIC.md](./PARTICIPANT_SCORING_LOGIC.md)** — автоматический скоринг участников
- **[PARTICIPANT_SCORING_IMPLEMENTATION_SUMMARY.md](./PARTICIPANT_SCORING_IMPLEMENTATION_SUMMARY.md)** — сводка реализации

---

## 🧹 История чистки

**Дата:** Февраль 2025  
**Удалено:** 
- 15 одноразовых SQL fix-скриптов из `db/`
- 165+ устаревших документов из `docs/`

**Что было удалено:**
- Все FIX/SUMMARY документы по историческим багам
- Промежуточные гайды по установке
- Многочисленные QUICK/ITERATION документы
- Документы по реализованным фичам (Import History, Auth fixes, Mobile UI, etc.)
- Папка `docs/db/` с устаревшими инструкциями

**Что осталось:**
- Актуальные setup guides
- Архитектурные документы
- Документация по Telegram интеграции
- Финальные сводки по очистке БД

---

## 📂 Структура проекта

```
orbo-1.1/
├── app/                    # Next.js App Router
├── components/             # React компоненты
├── lib/                    # Утилиты и сервисы
│   ├── services/          # Бизнес-логика
│   └── server/            # Server-side утилиты
├── db/                     # SQL миграции и инициализация
│   └── migrations/        # Нумерованные миграции
├── docs/                   # Документация (вы здесь)
├── memory-bank/            # Memory Bank (задачи, контекст, архив)
└── public/                 # Статические файлы
```

---

## 🔗 Полезные ссылки

- **Production:** https://app.orbo.ru
- **Supabase Project:** [Ссылка на Supabase Dashboard]
- **Vercel Project:** [Ссылка на Vercel]
- **Telegram Bots:**
  - `@orbo_community_bot` — управление группами
  - `@orbo_assistant_bot` — авторизация участников

---

## 💡 Принципы работы с документацией

1. **Не создавать FIX-документы** для каждого бага — фиксить сразу в коде
2. **Не хранить промежуточные SUMMARY** — оставлять только финальные
3. **Устаревшие гайды удалять** — поддерживать один актуальный SETUP_GUIDE
4. **Архитектурные доки обновлять** при изменении логики

---

**Последнее обновление:** 31 октября 2025 (Хэллоуин 🎃)

