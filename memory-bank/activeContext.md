# Orbo — Active Context

**Дата обновления:** 9 февраля 2026  
**Статус:** Production + активная разработка

---

## На текущий месяц: Февраль 2026

### Текущие приоритеты (по ROADMAP_FEB_2026_ICP.md):
1. **Улучшение событий** — история в профиле, аналитика, унификация напоминаний
2. **Система анонсов** — расширение UI, связь с событиями
3. **Стабилизация заявок** — автоодобрение, closing bugs

### Что сделано за 1-9 февраля 2026:

| Область | Что сделано |
|---------|-------------|
| **Supabase** | Полностью удалён из проекта (код, конфиги, документация) |
| **События** | QR check-in (опциональный), ручной check-in для админов, Google Calendar/ICS экспорт, удаление событий, диаграмма регистраций на дашборде |
| **Анонсы** | Выбор ссылки (miniapp/web) при создании, авто-анонсы при создании события |
| **Уведомления** | Авто-решение churning/inactive, топик-анализ (forum topics), агрегация негатива по группе, единая цветовая схема (3 цвета), фикс ссылок |
| **AI** | Обогащение с контекстом событий, заявок, профиля участника |
| **Суперадмин** | Имперсонация (вход в любую организацию), фикс всех 403/500 ошибок |
| **Безопасность** | Изоляция данных между организациями (participant activity), security headers в nginx |
| **Дашборд** | Онбординг: 5 шагов под ICP, скрытие онбординга, компактные блоки |
| **DevOps** | PostgreSQL tuning, Docker update, ротация логов, оптимизация logging levels |

### Ключевые документы:
- `docs/ROADMAP_FEB_2026_ICP.md` — активный роадмап
- `docs/OPERATIONS_GUIDE.md` — деплой, SSH, БД
- `docs/ARCHITECTURE.md` — архитектура системы

---

## Ранее выполнено (2025 — январь 2026)

### Спринты 1-4: Уведомления + MiniApp + OAuth (100%):
- Таблицы `notification_rules` + `notification_logs`
- UI для правил и уведомлений
- 5 типов правил: негатив (AI), неотвеченные вопросы (AI), неактивные группы, churning, newcomers
- AI-анализ с OpenAI (gpt-4o-mini)
- Отправка уведомлений через @orbo_assist_bot
- @orbo_event_bot и WebApp для регистрации на события
- NextAuth.js интеграция (Google + Yandex OAuth)
- Unified Auth Layer (`lib/auth/unified-auth.ts`)

### Core Platform (95%):
- Аутентификация (email + Telegram magic codes)
- Мультиорганизации
- Telegram интеграция (3 бота, webhook, импорт истории)
- Профильные поля для событий и организаций
- Аналитика (dashboard, group metrics, зоны внимания)
- Уведомления (правила, крон, Telegram доставка)
- Orbo Apps (AI Constructor, 4 типа приложений)

---

## Технологический стек

- **Frontend:** Next.js 15 (App Router), TailwindCSS, shadcn/ui
- **Backend:** Next.js API Routes, direct PostgreSQL
- **Database:** PostgreSQL 16 (Selectel server, Docker container)
- **Auth:** NextAuth.js v5 (Google, Yandex OAuth) + Telegram magic codes
- **AI:** OpenAI gpt-4o-mini (обогащение, анализ негатива/вопросов)
- **Logging:** pino structured logging
- **Storage:** Selectel S3
- **Bots:** @orbo_community_bot, @orbo_assist_bot, @orbo_event_bot
- **Deployment:** Selectel VPS, Docker Compose, Nginx, Let's Encrypt SSL

---

## Backlog

### Февраль 2026 (оставшиеся задачи):
1. История событий в профиле участника
2. Аналитика событий (конверсия, no-show rate)
3. Унификация напоминаний через анонсы
4. Стабилизация заявок

### Март 2026:
1. Интеграция ЮKassa (автоматический приём оплат)
2. Повторяющиеся события
3. Шаблоны событий
4. Биллинг инфраструктура

---

**Next Review:** Конец февраля 2026
