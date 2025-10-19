# Orbo - Comprehensive Product Requirements Document

> **Версия:** 2.0  
> **Дата:** 20 января 2025  
> **Статус:** Реализовано и протестировано  
> **Автор:** Orbo Development Team

## 📋 Содержание

1. [Обзор проекта](#обзор-проекта)
2. [Архитектура системы](#архитектура-системы)
3. [Модули и функциональность](#модули-и-функциональность)
4. [Пользовательские роли и права](#пользовательские-роли-и-права)
5. [База данных](#база-данных)
6. [Интеграции](#интеграции)
7. [UI/UX](#uiux)
8. [Безопасность](#безопасность)
9. [Развертывание](#развертывание)
10. [Roadmap](#roadmap)

---

## Обзор проекта

### Цель

**Orbo** - платформа для управления образовательными и коммьюнити-пространствами с глубокой интеграцией с Telegram.

### Ключевые возможности

- 🏢 **Мультиорганизационность** - один пользователь может состоять в нескольких организациях
- 💬 **Telegram интеграция** - автоматический импорт участников, аналитика, авторизация
- 📚 **База знаний** - создание и управление учебными материалами
- 📅 **Управление событиями** - создание, регистрация, ICS файлы
- 👥 **Управление участниками** - умное слияние дубликатов, теневые профили
- 📊 **Аналитика** - детальная статистика по активности и вовлеченности
- 🔐 **Гибкая авторизация** - email, magic links, Telegram коды

### Технологический стек

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- TailwindCSS
- Lucide Icons

**Backend:**
- Next.js API Routes
- Supabase (PostgreSQL + Auth + Storage)
- Vercel (Hosting + Edge Functions)

**Интеграции:**
- Telegram Bot API (2 бота: main + notifications)
- Mailgun (Email service)

**Инфраструктура:**
- Domain: `app.orbo.ru`
- Database: Supabase PostgreSQL
- Storage: Supabase Storage
- Deployment: Vercel (автодеплой из Git)

---

## Архитектура системы

### Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
│                    (app.orbo.ru)                             │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │ Public Pages│  │ Auth Pages  │  │ App Shell   │        │
│   │ (/p/...)    │  │ (/signin)   │  │ (/app/...)  │        │
│   └─────────────┘  └─────────────┘  └─────────────┘        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                         │
│   /api/auth/...        /api/telegram/...                    │
│   /api/events/...      /api/participants/...                │
│   /api/organizations/...                                    │
└───┬─────────────┬─────────────┬───────────────┬────────────┘
    │             │             │               │
    ▼             ▼             ▼               ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Supabase │ │ Telegram │ │ Mailgun  │ │ Supabase     │
│ Auth     │ │ Bot API  │ │ API      │ │ Storage      │
└──────────┘ └──────────┘ └──────────┘ └──────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase PostgreSQL                         │
│   Organizations | Participants | Events | Materials          │
│   Memberships | Telegram Groups | Analytics                 │
└─────────────────────────────────────────────────────────────┘
```

### Структура базы данных

**Core Tables:**
- `organizations` - Организации
- `memberships` - Членство в организациях (roles)
- `participants` - Участники (импорт из Telegram)

**Telegram:**
- `telegram_groups` - Подключенные Telegram группы
- `org_telegram_groups` - Many-to-many связь
- `user_telegram_accounts` - Telegram аккаунты пользователей
- `telegram_group_admins` - Администраторы групп
- `telegram_auth_codes` - Коды для авторизации

**Content:**
- `events` - События
- `event_registrations` - Регистрации на события
- `material_pages` - База знаний (иерархическая)

**Analytics:**
- `activity_events` - События активности
- `group_metrics` - Метрики групп (daily aggregates)
- `participant_groups` - Принадлежность к группам

**Other:**
- `invitations` - Приглашения администраторов
- `participant_merge_history` - История слияний

---

## Модули и функциональность

### 1. Авторизация и регистрация

#### 1.1. Email авторизация

**Страницы:**
- `/signin` - Вход
- `/signup` - Регистрация

**Методы:**
- Magic Link (passwordless)
- Email + Password

**Процесс:**
1. Пользователь вводит email
2. Supabase отправляет magic link
3. Клик по ссылке → автоматический вход
4. Redirect на `/orgs` (выбор организации)

**Код:** `app/(auth)/signin/page.tsx`, `app/(auth)/signup/page.tsx`

#### 1.2. Telegram авторизация

**Для кого:** Участники Telegram групп без email

**Процесс:**
1. Участник нажимает кнопку "Войти через Telegram"
2. Система показывает Telegram User ID
3. Участник отправляет `/start` боту `@orbo_assistant_bot`
4. Бот присылает код верификации
5. Участник вводит код → вход

**Код:** `app/login/telegram/`, `lib/services/telegramAuthService.ts`

#### 1.3. Теневые профили (Shadow Profiles)

**Что это:** Пользователи, автоматически созданные из Telegram админов без email.

**Характеристики:**
- ❌ Нет email
- ✅ Есть Telegram аккаунт
- ✅ Могут просматривать контент
- ❌ НЕ могут редактировать (read-only)

**Активация:**
- Добавить email на странице профиля
- Подтвердить email кодом
- Получить полные права

**Код:** `db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql`

### 2. Организации

#### 2.1. Создание организации

**Страница:** `/app/create-organization`

**Поля:**
- Название организации (обязательно)
- Логотип (опционально, загрузка в Storage)

**Процесс:**
1. Пользователь заполняет форму
2. Создается запись в `organizations`
3. Создается `membership` с `role=owner`
4. Redirect на `/app/[org]/dashboard`

**Код:** `app/app/create-organization/page.tsx`

#### 2.2. Выбор организации

**Страница:** `/orgs`

**Отображение:**
- Список всех организаций пользователя
- Роль в каждой (Owner/Admin/Member)
- Логотип организации

**Код:** `app/orgs/page.tsx`

#### 2.3. Настройки организации

**Страница:** `/app/[org]/settings`

**Доступные настройки:**
- Основная информация (название, логотип)
- Команда организации (владелец + администраторы)
- Приглашения (для будущих функций)

**Код:** `app/app/[org]/settings/page.tsx`

### 3. Telegram интеграция

#### 3.1. Подключение Telegram групп

**Страница:** `/app/[org]/telegram`

**Процесс:**
1. **Настройка Telegram аккаунта** (`/app/[org]/telegram/account`):
   - Ввести Telegram User ID
   - Верифицировать через код от бота
   
2. **Подключение групп:**
   - Вариант A: Автоматический список доступных групп
   - Вариант B: Ручное добавление по Chat ID

3. **Синхронизация:**
   - Автоматический импорт участников
   - Подключение к `org_telegram_groups`

**Код:**
- `app/app/[org]/telegram/page.tsx`
- `app/app/[org]/telegram/account/page.tsx`
- `app/app/[org]/telegram/available-groups/page.tsx`

#### 3.2. Telegram боты

**Два бота:**

**1. `orbo_community_bot` (Main Bot)**
- Обработка сообщений в группах
- Импорт участников
- Аналитика активности
- Webhook: `/api/telegram/webhook`

**2. `orbo_assistant_bot` (Notifications Bot)**
- Авторизация (отправка кодов)
- Получение User ID (`/start`)
- Уведомления (планируется)
- Webhook: `/api/telegram/notifications/webhook`

**Код:**
- `lib/services/telegramService.ts`
- `lib/services/eventProcessingService.ts`

#### 3.3. Автоматический импорт участников

**Процесс:**
1. Бот получает сообщение в группе (webhook)
2. `EventProcessingService` обрабатывает событие
3. Создается/обновляется `participant`
4. Создается `activity_event`
5. Обновляется `participant_groups`

**Дедупликация:**
- UPSERT по `(org_id, tg_user_id)`
- Проверка `merged_into` (для объединенных)
- Обновление `last_activity_at`

**Код:**
- `lib/services/eventProcessingService.ts`
- `app/api/telegram/webhook/route.ts`

#### 3.4. Синхронизация администраторов

**Автоматическая синхронизация:**

**Триггеры:**
1. Кнопка "Обновить права администраторов" (`/app/[org]/telegram/account`)
2. Кнопка "Синхронизировать с Telegram" (`/app/[org]/settings` → Команда)

**Процесс:**
1. API запрашивает у Telegram Bot API список админов группы
2. Сохраняет в `telegram_group_admins`
3. Вызывает функцию `sync_telegram_admins(org_id)`
4. Функция создает/обновляет `memberships` с `role_source=telegram_admin`

**Особенности:**
- Автоматическое создание теневых профилей (если нет email)
- Срок действия 7 дней (`expires_at`)
- Не понижает владельца до админа

**Код:**
- `app/api/telegram/groups/update-admins/route.ts`
- `db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql`

### 4. Участники (Participants)

#### 4.1. Импорт из Telegram

**Автоматический:**
- При получении сообщения в группе
- Создается `participant` с данными из Telegram
- `source = 'telegram'`
- `tg_user_id`, `username`, `first_name`, `last_name`

**Ручной:**
- Создание участника через UI (планируется)

#### 4.2. Профили участников

**Страница:** `/app/[org]/members` → клик на участника

**Поля:**
- Фото (загрузка или синхронизация с Telegram)
- Полное имя
- Имя, Фамилия
- Email (если есть)
- Телефон (если есть)
- Username (Telegram)
- Био (описание)
- Custom attributes (произвольные поля JSON)
- Статус (active/inactive)
- Источник (telegram/manual)
- Последняя активность

**Редактирование:**
- Доступно только админам и владельцу
- Обновление через `PATCH /api/participants/[id]`

**Код:**
- `app/app/[org]/members/page.tsx`
- `components/members/member-card.tsx`
- `components/members/members-table.tsx`

#### 4.3. Умное слияние дубликатов

**Проблема:** Один человек может быть импортирован несколько раз (разные Telegram ID, email, телефон).

**Решение:**

**Алгоритм:**
1. **Точное совпадение:**
   - Одинаковый `email`
   - Одинаковый `phone`
   - Одинаковый `tg_user_id`

2. **Fuzzy matching:**
   - Похожие имена (Levenshtein distance)
   - Схожие username

**UI:**
- Страница `/app/[org]/members/duplicates`
- Показывает потенциальные дубликаты
- Предпросмотр данных обоих участников
- Выбор основного профиля
- Кнопка "Объединить"

**Процесс слияния:**
1. Переносятся все данные из вторичного в основной
2. Обновляются все связи (event_registrations, activity_events)
3. Вторичный помечается как `merged_into = primary_id`
4. Сохраняется в `participant_merge_history`

**Код:**
- `app/app/[org]/members/duplicates/page.tsx`
- `lib/services/participants/matcher.ts`
- `lib/services/participants/merger.ts`

#### 4.4. Фотографии участников

**Источники:**
1. **Telegram:** Автоматическая синхронизация через Bot API
2. **Ручная загрузка:** Через UI (Storage bucket)

**Процесс синхронизации с Telegram:**
1. API запрашивает `getUserProfilePhotos(tg_user_id)`
2. Скачивает файл через `getFile()` + `downloadFile()`
3. Загружает в Supabase Storage (`participant-photos/`)
4. Обновляет `photo_url` в `participants`

**Приоритет:**
- Ручная загрузка > Telegram фото
- Не перезаписывает ручные фото

**Код:**
- `app/api/participants/[participantId]/sync-telegram-photo/route.ts`
- `lib/hooks/useTelegramPhoto.ts`
- `components/members/participant-avatar.tsx`

### 5. События (Events)

#### 5.1. Создание событий

**Страница:** `/app/[org]/events` → "Создать событие"

**Поля:**
- Название (обязательно)
- Описание (Markdown + HTML предпросмотр)
- Дата и время начала
- Длительность
- Локация (текстовое поле)
- Максимум участников (опционально)
- Visibility (публичное/для членов организации)

**Процесс:**
1. Заполнение формы
2. Сохранение в `events`
3. Генерация уникального `share_token`
4. Redirect на страницу события

**Код:** `app/app/[org]/events/create/page.tsx`

#### 5.2. Регистрация на события

**Для членов организации:**
- Страница: `/app/[org]/events/[id]`
- Кнопка "Зарегистрироваться"
- Автоматическая привязка к `participant` (если есть Telegram)

**Для публичного доступа:**
- Страница: `/p/[org]/events/[id]`
- Share token в URL
- Форма регистрации (email, имя, телефон)
- Создается `participant` если не существует

**Процесс:**
1. Проверка, не зарегистрирован ли уже
2. Проверка лимита участников
3. Создание `event_registration`
4. Генерация ICS файла
5. Отправка email с подтверждением (опционально)

**Код:**
- `app/app/[org]/events/[id]/page.tsx`
- `app/p/[org]/events/[id]/page.tsx`
- `components/events/event-detail.tsx`
- `components/events/public-event-detail.tsx`

#### 5.3. ICS файлы (календарь)

**Генерация:**
- Автоматически при регистрации
- Кнопка "Добавить в календарь"

**Формат:** RFC 5545 (iCalendar)

**Поля:**
- VEVENT
- SUMMARY (название)
- DESCRIPTION (описание)
- DTSTART/DTEND (время)
- LOCATION (локация)
- UID (уникальный ID)

**Код:** `app/api/events/[id]/ics/route.ts`

### 6. База знаний (Materials)

#### 6.1. Иерархическая структура

**Модель:**
- Древовидная структура (parent_id)
- Unlimited nesting
- Position для сортировки
- Slug для URL

**Пример структуры:**
```
📁 Курс React
  📄 Введение
  📁 Основы
    📄 Компоненты
    📄 Props и State
  📁 Хуки
    📄 useState
    📄 useEffect
```

**Код:** `db/schema` - таблица `material_pages`

#### 6.2. Редактор материалов

**Страница:** `/app/[org]/materials/[slug]/edit`

**Возможности:**
- **Markdown редактор** с предпросмотром
- **HTML режим** (для продвинутых)
- **Вставка медиа:**
  - YouTube видео (embed)
  - VK видео (embed)
  - Изображения (планируется)
- **Дерево материалов** слева (navigation tree)
- **Autosave** (каждые 30 секунд)

**Процесс:**
1. Редактирование в Markdown
2. Конвертация в HTML (для предпросмотра)
3. Сохранение обоих форматов (`content_md`, `content_html`)
4. Обновление `updated_at`

**Особенности:**
- Если видео вставлено без title → автоматический placeholder
- После сохранения title обновляется в дереве без перезагрузки

**Код:**
- `components/materials/materials-page-editor.tsx`
- `components/materials/materials-page-viewer.tsx`

#### 6.3. Просмотр материалов

**Для членов:** `/app/[org]/materials/[slug]`

**Для публичного доступа:** `/p/[org]/materials/[slug]` (если `visibility=public`)

**Отображение:**
- Rendered HTML
- Navigation tree слева
- Breadcrumbs
- Метаданные (автор, дата создания)

**Код:**
- `app/app/[org]/materials/[slug]/page.tsx`
- `app/p/[org]/materials/[slug]/page.tsx`

### 7. Аналитика

#### 7.1. Dashboard

**Страница:** `/app/[org]/dashboard`

**Виджеты:**

**1. Статистика участников:**
- Всего участников
- Новые за последние 7 дней
- Ушедшие за последние 7 дней

**2. Activity за 14 дней:**
- График сообщений по дням
- Данные из `group_metrics` (aggregated)

**3. Зоны внимания:**
- Критические события (< 5 участников)
- Уходящие участники (неактивны > 30 дней)
- Неактивные новички (присоединились недавно, но тихие)

**4. Предстоящие события:**
- Список ближайших событий
- Количество зарегистрированных

**Код:**
- `app/app/[org]/dashboard/page.tsx`
- `app/api/dashboard/[orgId]/route.ts`
- `components/dashboard/activity-chart.tsx`
- `components/dashboard/attention-zones.tsx`

#### 7.2. Аналитика группы

**Страница:** `/app/[org]/telegram/groups/[groupId]`

**Вкладки:**

**1. Обзор:**
- Название группы
- Тип (группа/супергруппа/канал)
- Количество участников
- Статус бота

**2. Аналитика:**
- График активности (сообщения по дням)
- Top участники по сообщениям
- Динамика роста участников

**3. Участники группы:**
- Таблица участников
- Фильтры (активные/неактивные)
- Статус админа (иконка)
- Последняя активность

**4. Настройки:**
- Отключить/подключить группу
- Удалить группу из организации

**Код:**
- `app/app/[org]/telegram/groups/[groupId]/page.tsx`
- `app/api/telegram/analytics/data/route.ts`

#### 7.3. Метрики групп

**Таблица:** `group_metrics`

**Aggregation:** Daily (каждый день = 1 запись на группу)

**Поля:**
- `date` (дата)
- `tg_chat_id` (ID группы)
- `org_id` (организация)
- `message_count` (количество сообщений)
- `active_users` (уникальные отправители)
- `new_members` (новые участники)
- `left_members` (ушедшие участники)

**Процесс:**
1. Webhook получает событие
2. `EventProcessingService` создает `activity_event`
3. Триггер или Cron Job агрегирует в `group_metrics`

**Код:** `db/schema`, триггеры PostgreSQL

### 8. Профиль пользователя

#### 8.1. Страница профиля

**Страница:** `/app/[org]/profile`

**Секции:**

**1. Основная информация:**
- Аватарка (автозагрузка из Telegram)
- Имя, email, роль
- Редактирование имени и био
- Список групп администрирования (если админ)

**2. Email аккаунт:**
- Статус подтверждения
- Для теневых: форма активации (добавить email)

**3. Telegram аккаунт:**
- Username, User ID
- Статус верификации
- Привязка/отвязка Telegram

**4. Кнопка "Выйти":**
- В хедере страницы (справа от заголовка)

**Код:**
- `app/app/[org]/profile/page.tsx`
- `app/api/user/profile/route.ts`

#### 8.2. Профиль в меню

**Замена кнопки "Выйти":**
- Вместо кнопки "Выйти" → аватарка + имя
- Клик → переход на `/app/[org]/profile`

**Отображение:**
- **Collapsed:** Круглая аватарка
- **Expanded:** Аватарка + имя + email

**Код:**
- `components/navigation/collapsible-sidebar.tsx`
- `app/app/[org]/layout.tsx`

### 9. Команда организации

#### 9.1. Управление командой

**Страница:** `/app/[org]/settings` → Команда организации

**Отображение:**

**Владелец:**
- 👑 Иконка короны
- Фиолетовый фон
- Email и статус
- Telegram данные (если привязан)

**Администраторы:**
- 👨‍💼 Бейдж "Администратор"
- 👻 Бейдж "Теневой профиль" (если нет email)
- 🔗 Бейдж "Из Telegram" (автодобавленные)
- Email и статус подтверждения
- Telegram username и статус верификации
- Список групп, где администратор
- Дата синхронизации

**Код:** `components/settings/organization-team.tsx`

#### 9.2. Добавление администраторов

**Два способа:**

**1. Автоматически из Telegram:**
- Назначить админом в Telegram группе
- Нажать "Синхронизировать с Telegram"
- Админ автоматически добавляется

**2. Вручную по email:**
- Кнопка "Добавить администратора"
- Ввести email
- Отправляется приглашение
- Создается `invitation`

**Код:**
- `components/settings/add-admin-dialog.tsx`
- `app/api/organizations/[id]/team/add/route.ts`

#### 9.3. Синхронизация с Telegram

**Кнопка:** "Синхронизировать с Telegram"

**Процесс:**
1. Вызывает `POST /api/organizations/[id]/team`
2. API вызывает RPC `sync_telegram_admins(org_id)`
3. Функция ищет всех админов в подключенных группах
4. Создает/обновляет `memberships`
5. Возвращает список изменений

**Код:**
- `app/api/organizations/[id]/team/route.ts`
- `db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql`

---

## Пользовательские роли и права

### Роли

#### 1. Owner (Владелец)

**Как получить:**
- Автоматически при создании организации

**Права:**
- ✅ Полный доступ ко всем функциям
- ✅ Управление настройками организации
- ✅ Добавление/удаление администраторов
- ✅ Управление Telegram интеграцией
- ✅ Просмотр аналитики
- ✅ Создание/редактирование материалов и событий
- ✅ Управление участниками

**Ограничения:**
- Один владелец на организацию
- Не может быть понижен до админа автоматически

#### 2. Admin (Администратор)

**Как получить:**
- Добавлен владельцем вручную (по email)
- Автоматически из Telegram (role_source=telegram_admin)

**Права:**
- ✅ Просмотр аналитики
- ✅ Создание/редактирование материалов и событий
- ✅ Управление участниками
- ❌ НЕ может управлять настройками организации
- ❌ НЕ может добавлять/удалять других администраторов

**Теневой админ (без email):**
- ✅ Просмотр контента
- ❌ НЕ может редактировать (read-only)
- Может активировать профиль, добавив email

#### 3. Member (Участник)

**Как получить:**
- Автоматически импортирован из Telegram группы
- Зарегистрирован на событие

**Права:**
- ✅ Просмотр материалов (public + org_members)
- ✅ Просмотр событий
- ✅ Регистрация на события
- ❌ НЕ может создавать/редактировать контент
- ❌ НЕ может видеть аналитику

#### 4. Guest (Гость)

**Как получить:**
- Открыл публичную ссылку (`/p/[org]/...`)

**Права:**
- ✅ Просмотр публичных материалов (visibility=public)
- ✅ Просмотр публичных событий
- ✅ Регистрация на публичные события
- ❌ Нет доступа к закрытым разделам

### Матрица прав

| Функция | Owner | Admin | Shadow Admin | Member | Guest |
|---------|-------|-------|--------------|--------|-------|
| Просмотр материалов (public) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Просмотр материалов (org) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Создание материалов | ✅ | ✅ | ❌ | ❌ | ❌ |
| Редактирование материалов | ✅ | ✅ | ❌ | ❌ | ❌ |
| Просмотр событий | ✅ | ✅ | ✅ | ✅ | ✅* |
| Создание событий | ✅ | ✅ | ❌ | ❌ | ❌ |
| Регистрация на события | ✅ | ✅ | ✅ | ✅ | ✅* |
| Просмотр участников | ✅ | ✅ | ✅ | ✅ | ❌ |
| Редактирование участников | ✅ | ✅ | ❌ | ❌ | ❌ |
| Аналитика | ✅ | ✅ | ✅ | ❌ | ❌ |
| Настройки организации | ✅ | ❌ | ❌ | ❌ | ❌ |
| Управление командой | ✅ | ❌ | ❌ | ❌ | ❌ |
| Telegram настройки | ✅ | ❌ | ❌ | ❌ | ❌ |

*Только для публичных событий

---

## База данных

### Схема БД

#### Core Tables

**`organizations`**
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
logo_url TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**`memberships`**
```sql
org_id UUID REFERENCES organizations
user_id UUID REFERENCES auth.users
role TEXT (owner/admin/member)
role_source TEXT (manual/telegram_admin/invitation)
metadata JSONB (telegram_groups, shadow_profile, etc)
created_at TIMESTAMPTZ
PRIMARY KEY (org_id, user_id)
```

**`participants`**
```sql
id UUID PRIMARY KEY
org_id UUID REFERENCES organizations
tg_user_id BIGINT (Telegram User ID)
username TEXT
first_name TEXT
last_name TEXT
full_name TEXT
email TEXT
phone TEXT
photo_url TEXT
bio TEXT
custom_attributes JSONB
status TEXT (active/inactive)
source TEXT (telegram/manual)
merged_into UUID REFERENCES participants
last_activity_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE (org_id, tg_user_id)
UNIQUE (org_id, email) WHERE email IS NOT NULL
```

#### Telegram Tables

**`telegram_groups`**
```sql
id SERIAL PRIMARY KEY
tg_chat_id BIGINT UNIQUE NOT NULL
title TEXT
type TEXT (group/supergroup/channel)
bot_status TEXT
verified_by_user_id UUID
created_at TIMESTAMPTZ
```

**`org_telegram_groups`** (Many-to-Many)
```sql
org_id UUID REFERENCES organizations
tg_chat_id BIGINT REFERENCES telegram_groups
added_by_user_id UUID REFERENCES auth.users
created_at TIMESTAMPTZ
PRIMARY KEY (org_id, tg_chat_id)
```

**`user_telegram_accounts`**
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES auth.users
org_id UUID REFERENCES organizations
telegram_user_id BIGINT NOT NULL
telegram_username TEXT
telegram_first_name TEXT
telegram_last_name TEXT
is_verified BOOLEAN DEFAULT FALSE
verified_at TIMESTAMPTZ
created_at TIMESTAMPTZ
UNIQUE (user_id, org_id)
UNIQUE (telegram_user_id, org_id)
```

**`telegram_group_admins`**
```sql
tg_chat_id BIGINT NOT NULL
tg_user_id BIGINT NOT NULL
user_telegram_account_id UUID REFERENCES user_telegram_accounts
is_owner BOOLEAN DEFAULT FALSE
is_admin BOOLEAN DEFAULT TRUE
custom_title TEXT
can_manage_chat BOOLEAN
can_delete_messages BOOLEAN
can_manage_video_chats BOOLEAN
can_restrict_members BOOLEAN
can_promote_members BOOLEAN
can_change_info BOOLEAN
can_invite_users BOOLEAN
can_pin_messages BOOLEAN
can_post_messages BOOLEAN
can_edit_messages BOOLEAN
verified_at TIMESTAMPTZ
expires_at TIMESTAMPTZ (7 days from verified_at)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
PRIMARY KEY (tg_chat_id, tg_user_id)
```

**`telegram_auth_codes`**
```sql
id SERIAL PRIMARY KEY
code TEXT UNIQUE NOT NULL
telegram_user_id BIGINT NOT NULL
user_id UUID REFERENCES auth.users
org_id UUID REFERENCES organizations
is_used BOOLEAN DEFAULT FALSE
used_at TIMESTAMPTZ
expires_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

#### Content Tables

**`events`**
```sql
id UUID PRIMARY KEY
org_id UUID REFERENCES organizations
title TEXT NOT NULL
description TEXT
start_at TIMESTAMPTZ NOT NULL
duration_minutes INTEGER
location TEXT
max_participants INTEGER
visibility TEXT (public/org_members)
share_token TEXT UNIQUE
created_by UUID REFERENCES auth.users
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**`event_registrations`**
```sql
id UUID PRIMARY KEY
event_id UUID REFERENCES events
participant_id UUID REFERENCES participants
registered_at TIMESTAMPTZ
UNIQUE (event_id, participant_id)
```

**`material_pages`**
```sql
id UUID PRIMARY KEY
org_id UUID REFERENCES organizations
parent_id UUID REFERENCES material_pages
title TEXT NOT NULL
slug TEXT NOT NULL
content_md TEXT (Markdown)
content_html TEXT (HTML)
visibility TEXT (public/org_members/admins)
is_published BOOLEAN DEFAULT TRUE
position INTEGER
created_by UUID REFERENCES auth.users
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
UNIQUE (org_id, slug)
```

#### Analytics Tables

**`activity_events`**
```sql
id UUID PRIMARY KEY
org_id UUID REFERENCES organizations
participant_id UUID REFERENCES participants
tg_chat_id BIGINT
event_type TEXT (message/join/leave/etc)
metadata JSONB
created_at TIMESTAMPTZ
```

**`group_metrics`**
```sql
id SERIAL PRIMARY KEY
date DATE NOT NULL
tg_chat_id BIGINT NOT NULL
org_id UUID REFERENCES organizations
message_count INTEGER DEFAULT 0
active_users INTEGER DEFAULT 0
new_members INTEGER DEFAULT 0
left_members INTEGER DEFAULT 0
created_at TIMESTAMPTZ
UNIQUE (date, tg_chat_id, org_id)
```

**`participant_groups`**
```sql
participant_id UUID REFERENCES participants
tg_chat_id BIGINT
org_id UUID REFERENCES organizations
joined_at TIMESTAMPTZ
left_at TIMESTAMPTZ
is_active BOOLEAN DEFAULT TRUE
last_activity_at TIMESTAMPTZ
PRIMARY KEY (participant_id, tg_chat_id, org_id)
```

#### Other Tables

**`invitations`**
```sql
id UUID PRIMARY KEY
org_id UUID REFERENCES organizations
email TEXT NOT NULL
role TEXT (admin)
invited_by UUID REFERENCES auth.users
status TEXT (pending/accepted/expired)
token TEXT UNIQUE
expires_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

**`participant_merge_history`**
```sql
id UUID PRIMARY KEY
org_id UUID REFERENCES organizations
primary_participant_id UUID REFERENCES participants
secondary_participant_id UUID
merged_by UUID REFERENCES auth.users
merged_at TIMESTAMPTZ
merged_data JSONB (snapshot of secondary)
```

### RLS Policies

**Row Level Security** включен для всех таблиц.

**Примеры политик:**

**organizations:**
- SELECT: пользователь имеет membership
- INSERT: authenticated users
- UPDATE: owner или admin
- DELETE: только owner

**participants:**
- SELECT: член организации
- INSERT: admin или owner
- UPDATE: admin или owner
- DELETE: только owner

**events:**
- SELECT: public или член организации
- INSERT: admin или owner
- UPDATE: admin или owner (или создатель)
- DELETE: admin или owner (или создатель)

**material_pages:**
- SELECT: public или член организации
- INSERT: admin или owner
- UPDATE: admin или owner (или создатель)
- DELETE: admin или owner (или создатель)

### Индексы

**Performance indexes:**
```sql
CREATE INDEX idx_participants_org_tg ON participants(org_id, tg_user_id);
CREATE INDEX idx_participants_org_email ON participants(org_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_activity_events_org_date ON activity_events(org_id, created_at);
CREATE INDEX idx_group_metrics_chat_date ON group_metrics(tg_chat_id, date);
CREATE INDEX idx_telegram_group_admins_expires ON telegram_group_admins(expires_at) WHERE is_admin = true;
```

### Функции и триггеры

**Функции:**
- `sync_telegram_admins(org_id)` - синхронизация админов из Telegram
- `update_updated_at()` - автообновление updated_at
- `calculate_group_metrics()` - агрегация метрик (планируется)

**Триггеры:**
- `BEFORE UPDATE` на всех таблицах → `update_updated_at()`
- `AFTER INSERT` на `activity_events` → обновление `last_activity_at`

---

## Интеграции

### Telegram Bot API

**Два бота:**

**1. Main Bot (`orbo_community_bot`)**
- Token: `TELEGRAM_BOT_TOKEN`
- Webhook: `https://app.orbo.ru/api/telegram/webhook`
- Secret: `TELEGRAM_WEBHOOK_SECRET`

**Функции:**
- Обработка сообщений в группах
- Импорт участников
- Tracking активности
- Commands: `/start`, `/help` (redirect to assistant bot)

**2. Notifications Bot (`orbo_assistant_bot`)**
- Token: `TELEGRAM_NOTIFICATIONS_BOT_TOKEN`
- Webhook: `https://app.orbo.ru/api/telegram/notifications/webhook`

**Функции:**
- Авторизация (отправка кодов)
- Получение User ID (`/start`)
- Уведомления (планируется)

**API методы:**
- `getMe()` - информация о боте
- `getChat(chat_id)` - информация о чате
- `getChatMember(chat_id, user_id)` - информация об участнике
- `getUserProfilePhotos(user_id)` - фотографии пользователя
- `getFile(file_id)` - получить файл
- `sendMessage(chat_id, text)` - отправить сообщение

**Код:** `lib/services/telegramService.ts`

### Supabase Auth

**Провайдеры:**
- Email (magic link)
- Email + Password

**Конфигурация:**
- URL: `NEXT_PUBLIC_SUPABASE_URL`
- Anon Key: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service Role Key: `SUPABASE_SERVICE_ROLE_KEY`

**Email templates:**
- Confirmation (регистрация)
- Invite (приглашение)
- Magic Link (вход)
- Change Email
- Reset Password

**Redirect URLs:**
- `https://app.orbo.ru/auth-callback`

**Код:** `lib/server/supabaseServer.ts`, `lib/client/supabaseClient.ts`

### Supabase Storage

**Buckets:**

**1. `participant-photos`**
- Public: Yes
- Allowed MIME types: `image/*`
- Max file size: 5MB
- Path: `participant_photos/{participant_id}.{ext}`

**RLS:**
- SELECT: Public
- INSERT: Authenticated
- UPDATE: Authenticated (owner or admin)
- DELETE: Admin only

**Код:** Supabase Dashboard → Storage

### Mailgun

**Конфигурация:**
- API Key: `MAILGUN_API_KEY`
- Domain: `MAILGUN_DOMAIN`
- From: `Orbo <noreply@orbo.ru>`

**Email типы:**
- Verification codes (для активации профиля)
- Admin invitations
- Event notifications (планируется)

**Код:** `lib/services/emailService.ts`

---

## UI/UX

### Дизайн система

**Цветовая палитра:**
- Primary: Blue (#3B82F6)
- Secondary: Purple (#8B5CF6)
- Success: Green (#10B981)
- Warning: Amber (#F59E0B)
- Error: Red (#EF4444)
- Neutral: Gray (#6B7280)

**Typography:**
- Font Family: Inter (system font fallback)
- Headings: Font weight 700 (Bold)
- Body: Font weight 400 (Regular)
- Small: Font size 0.875rem (14px)

**Spacing:**
- Base unit: 0.25rem (4px)
- Common: 0.5rem, 1rem, 1.5rem, 2rem

**Shadows:**
- sm: `0 1px 2px 0 rgb(0 0 0 / 0.05)`
- md: `0 4px 6px -1px rgb(0 0 0 / 0.1)`
- lg: `0 10px 15px -3px rgb(0 0 0 / 0.1)`

### Компоненты

**Базовые:**
- Button
- Input
- Card
- Badge
- Avatar
- Dialog/Modal
- Dropdown
- Tabs

**Сложные:**
- CollapsibleSidebar (навигация)
- ParticipantAvatar (с автозагрузкой из Telegram)
- AdminBadge (иконки ролей)
- MaterialsPageEditor (Markdown редактор)
- ActivityChart (аналитика)
- AttentionZones (dashboard виджеты)

**Код:** `components/ui/`, `components/`

### Навигация

**Главное меню (CollapsibleSidebar):**
- Dashboard (🏠)
- События (📅)
- Участники (👥)
- Материалы (📁)
- Telegram группы (expandable list)
- Настройки (⚙️)
- Профиль (аватарка + имя)

**Breadcrumbs:**
- Организация → Раздел → Подраздел

**Organization Switcher:**
- Dropdown с логотипами организаций
- Быстрое переключение между организациями

### Responsive дизайн

**Breakpoints:**
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Адаптации:**
- Mobile: Collapsed sidebar (hamburger menu)
- Tablet: Collapsed sidebar (icons only)
- Desktop: Expanded sidebar (icons + text)

---

## Безопасность

### Аутентификация

**Методы:**
- Supabase Auth (JWT tokens)
- HTTP-only cookies
- Secure session management

**Telegram webhook:**
- Secret token verification
- IP whitelisting (опционально)

### Авторизация

**Row Level Security (RLS):**
- Включен для всех таблиц
- Проверка membership для каждого запроса
- Service Role key только в API routes

**API Routes:**
- Проверка `auth.getUser()` в каждом endpoint
- Проверка прав доступа (role-based)
- Rate limiting (через Vercel)

### Валидация данных

**Frontend:**
- TypeScript типизация
- Zod schemas (планируется)
- Form validation

**Backend:**
- Параметры проверяются в API routes
- SQL injection защита (через Supabase client)
- XSS защита (sanitization)

### Storage Security

**Bucket policies:**
- Public read для фотографий
- Authenticated write
- Admin-only delete

**File validation:**
- MIME type проверка
- File size limit
- Extension whitelist

---

## Развертывание

### Vercel

**Конфигурация:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["arn1"]
}
```

**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_NOTIFICATIONS_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
MAILGUN_API_KEY
MAILGUN_DOMAIN
```

**Domain:**
- Production: `app.orbo.ru`
- Auto-deploy: `main` branch

### Supabase

**Project:**
- Region: Frankfurt (EU Central)
- Plan: Free (upgrade as needed)

**Database:**
- PostgreSQL 15
- Extensions: pgcrypto, uuid-ossp

**Migrations:**
- Applied sequentially (01-51)
- Tracked in `db/migrations/`

### Telegram Webhooks

**Setup:**
```bash
curl -X POST \
  https://api.telegram.org/bot<TOKEN>/setWebhook \
  -d url=https://app.orbo.ru/api/telegram/webhook \
  -d secret_token=<SECRET>
```

**Reset:**
```bash
curl -X POST \
  https://api.telegram.org/bot<TOKEN>/deleteWebhook
```

### Monitoring

**Logs:**
- Vercel Dashboard → Functions → Logs
- Supabase Dashboard → Logs

**Metrics:**
- Vercel Analytics
- Supabase Metrics

**Alerts:**
- Vercel Integration Webhooks
- Uptime monitoring (планируется)

---

## Roadmap

### Phase 1: MVP ✅ (Completed)

- [x] Авторизация (email + Telegram)
- [x] Организации (создание, настройки)
- [x] Telegram интеграция (подключение групп, импорт)
- [x] Участники (профили, дубликаты)
- [x] События (создание, регистрация, ICS)
- [x] Материалы (база знаний, Markdown редактор)
- [x] Аналитика (dashboard, группы)
- [x] Роли и права (owner/admin/member/shadow)

### Phase 2: Enhancement 🚧 (In Progress)

- [x] Профиль пользователя (единая страница)
- [x] Теневые профили (shadow admins)
- [x] Синхронизация админов из Telegram
- [x] Фотографии из Telegram
- [ ] Email уведомления (события, приглашения)
- [ ] Улучшенная аналитика (retention, engagement)
- [ ] Экспорт данных (CSV, Excel)

### Phase 3: Advanced Features 📝 (Planned)

- [ ] Автоматизация (welcome messages, reminders)
- [ ] Интеграция с календарями (Google Calendar, Outlook)
- [ ] Сертификаты и бейджи (gamification)
- [ ] Опросы и квизы
- [ ] Обсуждения (комментарии к материалам)
- [ ] Приватные сообщения (DM)
- [ ] Mobile app (React Native)

### Phase 4: Enterprise 🎯 (Future)

- [ ] SSO (Single Sign-On)
- [ ] Advanced permissions (custom roles)
- [ ] White-label (брендирование)
- [ ] API для разработчиков
- [ ] Webhooks для интеграций
- [ ] Audit logs (полный трекинг действий)
- [ ] GDPR compliance tools

---

## Заключение

**Orbo** - это комплексная платформа для управления образовательными сообществами с мощной Telegram интеграцией, гибкой системой ролей, аналитикой и автоматизацией.

**Ключевые достижения:**
- ✅ Полностью работающий MVP
- ✅ 51 миграция БД
- ✅ 2 Telegram бота
- ✅ Автоматический импорт участников
- ✅ Умное слияние дубликатов
- ✅ Иерархическая база знаний
- ✅ Детальная аналитика
- ✅ Теневые профили для админов

**Технологии:**
- Next.js 14, React 18, TypeScript
- Supabase (PostgreSQL + Auth + Storage)
- Telegram Bot API, Mailgun
- TailwindCSS, Vercel

**Архитектура:**
- Serverless (Vercel Edge Functions)
- Row Level Security (RLS)
- Real-time updates (планируется)
- Scalable and secure

---

**Контакты:**
- GitHub: [repository]
- Email: support@orbo.ru
- Telegram: @orbo_support

**Лицензия:** Proprietary

**Версия документа:** 2.0  
**Последнее обновление:** 20 января 2025

