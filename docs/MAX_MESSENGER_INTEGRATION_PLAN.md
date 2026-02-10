# Интеграция мессенджера MAX в Orbo — Анализ и план

**Дата:** 10 февраля 2026  
**Статус:** Проработка  
**Источники:** [dev.max.ru](https://dev.max.ru), [MAX Bot API](https://dev.max.ru/docs-api), [MAX Bridge](https://dev.max.ru/docs/webapps/bridge)

---

## 1. Сравнение возможностей: Telegram vs MAX

### 1.1 Bot API

| Возможность | Telegram | MAX | Совместимость |
|-------------|----------|-----|---------------|
| Webhook для событий | ✅ POST webhook | ✅ POST `/subscriptions` | Аналогично, но другой формат |
| Long polling | ✅ `getUpdates` | ✅ GET `/updates` | Аналогично |
| Отправка сообщений | ✅ `sendMessage` | ✅ POST `/messages` | Аналогично |
| Редактирование сообщений | ✅ `editMessageText` | ✅ PUT `/messages` | Аналогично |
| Удаление сообщений | ✅ `deleteMessage` | ✅ DELETE `/messages` | Аналогично |
| Получение списка чатов | ❌ (нет метода) | ✅ GET `/chats` | MAX лучше |
| Получение участников чата | ✅ `getChatMember` (по одному) | ✅ GET `/chats/{id}/members` (списком) | MAX лучше |
| Информация о чате | ✅ `getChat` | ✅ GET `/chats/{id}` | Аналогично |
| Список админов | ✅ `getChatAdministrators` | ✅ GET `/chats/{id}/members/admins` | Аналогично |
| Добавить участника | ❌ | ✅ POST `/chats/{id}/members` | MAX лучше |
| Удалить участника | ✅ `banChatMember` | ✅ DELETE `/chats/{id}/members` | Аналогично |
| Inline-клавиатура | ✅ (полная) | ✅ До 210 кнопок, 30 рядов | Аналогично |
| Callback buttons | ✅ `callback_query` | ✅ `message_callback` event | Аналогично |
| Форматирование текста | ✅ Markdown/HTML | ✅ Markdown/HTML | Аналогично, но разный синтаксис |
| Загрузка файлов | ✅ `sendDocument` | ✅ POST `/uploads` | Аналогично |
| Закрепление сообщений | ✅ `pinChatMessage` | ✅ PUT `/chats/{id}/pin` | Аналогично |
| Авторизация токеном | ✅ Query param `?bot_id=TOKEN` | ✅ Header `Authorization: TOKEN` | Другой способ |

### 1.2 Mini App (WebApp)

| Возможность | Telegram | MAX | Совместимость |
|-------------|----------|-----|---------------|
| Mini App / WebApp | ✅ Telegram WebApp | ✅ MAX Mini App | Аналогично |
| Bridge-библиотека | `telegram-web-app.js` | `max-web-app.js` | Другая библиотека |
| Глобальный объект | `window.Telegram.WebApp` | `window.WebApp` | Разные объекты |
| initData с user info | ✅ (user_id, first_name, username) | ✅ (user.id, user.first_name, user.username) | Аналогичная структура |
| Валидация initData | ✅ HMAC-SHA256 | ✅ hash verification | Аналогичный подход |
| start_param (deep link) | ✅ `?startapp=PARAM` | ✅ `?startapp=PARAM` (до 512 символов) | Совместимо |
| Кнопка "Назад" | ✅ BackButton | ✅ BackButton | Аналогично |
| Запрос контакта | ✅ `requestContact()` | ✅ `requestContact()` | Аналогично |
| Открытие ссылки | ✅ `openLink()` | ✅ `openLink()` | Аналогично |
| Шеринг контента | ✅ `switchInlineQuery()` | ✅ `shareContent()`, `shareMaxContent()` | MAX лучше |
| QR-сканер | ✅ `showScanQrPopup()` | ✅ `openCodeReader()` | Аналогично |
| Тактильная обратная связь | ✅ `HapticFeedback` | ✅ `HapticFeedback` | Аналогично |
| Биометрия | ❌ | ✅ `BiometricManager` | MAX лучше |
| Device Storage | ✅ `CloudStorage` | ✅ `DeviceStorage`, `SecureStorage` | Аналогично |
| Скачивание файлов | ❌ (через ссылку) | ✅ `downloadFile()` | MAX лучше |

### 1.3 Возможности платформы

| Возможность | Telegram | MAX | Комментарий |
|-------------|----------|-----|-------------|
| Групповые чаты | ✅ | ✅ | Основной сценарий |
| Каналы | ✅ | ✅ | Есть в MAX |
| Форум-топики (threads) | ✅ `message_thread_id` | ❌ Нет данных | **Вероятно нет** |
| Join requests (заявки на вступление) | ✅ `chat_join_request` | ❌ Нет данных | **Вероятно нет** |
| Команды бота (`/start`, `/help`) | ✅ `bot_command` entity | ❌ Нет данных о командах | Через текст сообщений |
| Deep links | ✅ `t.me/bot?start=` | ✅ `max.ru/` deeplinks | Разный формат |
| Суперадмины в чатах | ✅ `creator` role | ✅ Admin roles | Аналогично |
| Лимит запросов | 30 req/sec | 30 rps | Одинаково |

### 1.4 Что НЕДОСТУПНО в MAX (по сравнению с Telegram)

1. **Форум-топики** — нет подтверждённой поддержки `message_thread_id`
2. **Join requests** — нет аналога `chat_join_request` для заявок на вступление
3. **Inline mode** — нет данных о поддержке inline-ботов
4. **Stickers/Custom emoji** — нет данных
5. **Платежи через бота** — нет аналога Telegram Payments
6. **`my_chat_member` events** — нет явного аналога события о добавлении/удалении бота (нужно проверить)

---

## 2. Маппинг функционала Orbo на MAX

### 2.1 Полностью переносимый функционал (Фаза 1-2)

| Функция Orbo | Telegram реализация | MAX реализация | Сложность |
|-------------|---------------------|----------------|-----------|
| Подключение группы | Бот добавляется как админ | Аналогично | Низкая |
| Сбор сообщений | Webhook `message` | Webhook `message_created` | Средняя (адаптер) |
| Участники группы | `getChatMember` + activity_events | GET `/chats/{id}/members` | Средняя |
| Синхронизация админов | `getChatAdministrators` | GET `/chats/{id}/members/admins` | Низкая |
| Анонсы в группы | `sendMessage` с HTML | POST `/messages` с HTML | Низкая |
| Уведомления в DM | `sendMessage` botом | POST `/messages` botом | Низкая |
| AI-анализ негатива | Текст сообщений → OpenAI | Аналогично (текст одинаков) | Низкая |
| AI-обогащение профиля | Текст сообщений → OpenAI | Аналогично | Низкая |
| Регистрация через Mini App | Telegram WebApp | MAX Mini App | Средняя |
| QR check-in | Генерация QR → сканирование | Аналогично + `openCodeReader()` | Низкая |
| Deep links на события | `t.me/bot?startapp=e-{id}` | MAX deeplink с `startapp` | Низкая |
| Запрос контакта | `requestContact()` | `requestContact()` | Низкая |

### 2.2 Функционал, требующий адаптации (Фаза 3)

| Функция Orbo | Проблема в MAX | Решение |
|-------------|----------------|---------|
| Топик-анализ (forum threads) | Нет форум-топиков | Пропустить (не применимо) |
| Join requests (заявки) | Нет `chat_join_request` | Использовать Mini App + форму |
| Архивация при удалении бота | Нет `my_chat_member` event | Polling-проверка или обработка ошибок API |
| Telegram magic codes (авторизация) | Специфично для TG | Использовать другой механизм (Max user_id + initData) |

### 2.3 Функционал, специфичный для MAX

| Возможность MAX | Как использовать в Orbo |
|----------------|------------------------|
| GET `/chats` — список всех чатов бота | Автоматический discovery подключённых групп |
| POST `/chats/{id}/members` — добавление участников | Приглашение участников в группу через Orbo |
| `openCodeReader()` — нативный QR-сканер | Более удобный check-in на мероприятиях |
| `BiometricManager` | Безопасная авторизация в Mini App |
| `shareMaxContent()` — нативный шеринг | Шеринг ссылки на событие прямо из Mini App |
| `downloadFile()` — скачивание файлов | Скачивание билета/QR прямо в Mini App |

---

## 3. Архитектурный подход: мультимессенджер

### 3.1 Принцип: абстракция мессенджера

```
┌─────────────────────────────────────────────────┐
│                    Orbo Core                      │
│  (Events, Participants, Notifications, AI, CRM)  │
└──────────────────────┬──────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
  ┌──────────────┐ ┌──────────┐ ┌──────────┐
  │  Telegram    │ │   MAX    │ │  Future  │
  │  Adapter     │ │  Adapter │ │ (VK/etc) │
  └──────┬───────┘ └────┬─────┘ └────┬─────┘
         │              │            │
  ┌──────┴───────┐ ┌────┴─────┐ ┌────┴─────┐
  │ TG Bot API   │ │ MAX API  │ │  ...     │
  │ TG WebApp    │ │ MAX Mini │ │          │
  └──────────────┘ └──────────┘ └──────────┘
```

### 3.2 Ключевые абстракции

```typescript
// lib/messenger/types.ts
interface MessengerAdapter {
  type: 'telegram' | 'max';
  
  // Сообщения
  sendMessage(chatId: string, text: string, format?: 'html' | 'markdown'): Promise<MessageResult>;
  editMessage(chatId: string, messageId: string, text: string): Promise<void>;
  deleteMessage(chatId: string, messageId: string): Promise<void>;
  
  // Чаты и участники
  getChatInfo(chatId: string): Promise<ChatInfo>;
  getChatMembers(chatId: string): Promise<Member[]>;
  getChatAdmins(chatId: string): Promise<Member[]>;
  
  // Webhook обработка
  parseWebhookUpdate(body: any): NormalizedUpdate;
  verifyWebhookSignature(body: any, signature: string): boolean;
  
  // Mini App
  validateInitData(initData: string): InitDataResult;
}

// Нормализованное событие (единое для TG и MAX)
interface NormalizedUpdate {
  type: 'message' | 'callback' | 'member_joined' | 'member_left' | 'bot_added' | 'bot_removed';
  messenger: 'telegram' | 'max';
  chatId: string;
  userId: string;
  username?: string;
  firstName?: string;
  text?: string;
  messageId?: string;
  threadId?: string; // только для TG
  timestamp: Date;
  raw: any;
}
```

### 3.3 Изменения в БД

```sql
-- Новая колонка для мессенджер-типа
ALTER TABLE telegram_groups ADD COLUMN messenger_type VARCHAR(20) DEFAULT 'telegram';
-- Значения: 'telegram', 'max'

-- Индекс
CREATE INDEX idx_telegram_groups_messenger ON telegram_groups(messenger_type);

-- Участники: расширение для Max user_id
ALTER TABLE participants ADD COLUMN max_user_id BIGINT;
CREATE INDEX idx_participants_max_user_id ON participants(max_user_id);

-- Маппинг групп: расширение
ALTER TABLE org_telegram_groups ADD COLUMN messenger_type VARCHAR(20) DEFAULT 'telegram';
```

> **Важно:** Существующие таблицы `telegram_groups`, `participant_groups`, `activity_events` переиспользуются. Для MAX-групп `tg_chat_id` будет хранить Max chat_id (числовой). Поле `messenger_type` отличает TG от MAX.

---

## 4. Поэтапный план внедрения

### Фаза 0: Подготовка инфраструктуры (1-2 дня)

**Цель:** Подготовить абстракцию мессенджера без ломки текущего кода.

**Задачи:**
- [ ] Создать интерфейс `MessengerAdapter` в `lib/messenger/types.ts`
- [ ] Обернуть текущий TG-код в `TelegramAdapter` (реализация интерфейса)
- [ ] Добавить колонку `messenger_type` в `telegram_groups` и `org_telegram_groups`
- [ ] Добавить колонку `max_user_id` в `participants`
- [ ] Создать миграцию БД
- [ ] Зарегистрировать Max-бота на [dev.max.ru](https://dev.max.ru) и получить токен

**Нулевой риск для текущей работы:** Все текущие потоки продолжают работать через TelegramAdapter.

---

### Фаза 1: Базовая интеграция MAX (3-5 дней)

**Цель:** Подключение MAX-групп, сбор сообщений и участников.

**Задачи:**
- [ ] Реализовать `MaxAdapter` с методами:
  - `sendMessage`, `getChatInfo`, `getChatMembers`, `getChatAdmins`
  - `parseWebhookUpdate` — маппинг MAX events → NormalizedUpdate
  - `verifyWebhookSignature`
- [ ] Создать webhook endpoint `/api/max/webhook` (аналог `/api/telegram/webhook`)
- [ ] Настроить подписку на обновления через POST `/subscriptions`
- [ ] Обработка событий: `message_created` → `activity_events`
- [ ] UI: добавить "Подключить MAX-группу" в интерфейсе групп
- [ ] Отображение MAX-групп в общем списке (с иконкой MAX)
- [ ] Синхронизация участников MAX-групп

**Результат:** MAX-группы подключаются, сообщения собираются, участники видны в CRM.

---

### Фаза 2: Уведомления и анонсы через MAX (2-3 дня)

**Цель:** AI-уведомления и рассылка анонсов работают для MAX-групп.

**Задачи:**
- [ ] Расширить `notificationRulesService` для работы с MAX-группами
- [ ] AI-анализ негатива и неотвеченных вопросов для MAX-сообщений (текст одинаков)
- [ ] Отправка уведомлений админам через Max-бота (DM)
- [ ] Отправка анонсов в MAX-группы (аналог TG-анонсов)
- [ ] Формирование ссылок на сообщения в MAX (формат `max://...`)
- [ ] Attention zones (churning, inactive) работают для MAX-участников

**Результат:** Вся система уведомлений работает единообразно для TG и MAX.

---

### Фаза 3: Mini App для событий в MAX (3-5 дней)

**Цель:** Регистрация на мероприятия через MAX Mini App.

**Задачи:**
- [ ] Создать точку входа Mini App для MAX (`/tg-app/events/[id]` → универсализация)
- [ ] Подключить `max-web-app.js` в Mini App layout (определяется по User-Agent или параметру)
- [ ] Адаптировать валидацию `initData` для MAX формата
- [ ] Маппинг Max `user.id` → `participants.max_user_id`
- [ ] Регистрация через Mini App с deep link: `max://...?startapp=e-{eventId}`
- [ ] QR-ticket генерация и `openCodeReader()` для check-in
- [ ] `shareMaxContent()` — шеринг ссылки на событие
- [ ] Кнопки "Добавить в календарь" (через `openLink()` для Google Calendar)

**Результат:** Участники MAX могут регистрироваться на события через Mini App.

---

### Фаза 4: Полировка и кросс-мессенджер UX (2-3 дня)

**Цель:** Единый пользовательский опыт и кросс-мессенджерные участники.

**Задачи:**
- [ ] Объединение профилей: один участник может быть и в TG, и в MAX (мерж по телефону/имени)
- [ ] Аналитика по мессенджерам: фильтр "Telegram / MAX / Все" на дашборде
- [ ] Дашборд: диаграммы показывают данные из обоих мессенджеров
- [ ] Настройки организации: выбор мессенджера по умолчанию для анонсов
- [ ] Документация для пользователей: как подключить MAX-группу

**Результат:** Orbo полноценно работает как мультимессенджерная платформа.

---

## 5. Оценка трудозатрат

| Фаза | Задачи | Дни | Зависимости |
|-------|--------|-----|-------------|
| 0. Подготовка | Абстракция, миграции, регистрация бота | 1-2 | Доступ к dev.max.ru |
| 1. Базовая интеграция | Webhook, сообщения, участники | 3-5 | Фаза 0 |
| 2. Уведомления | AI-анализ, анонсы, DM | 2-3 | Фаза 1 |
| 3. Mini App | Регистрация на события | 3-5 | Фаза 1 |
| 4. Полировка | UX, аналитика, мерж профилей | 2-3 | Фазы 2-3 |
| **Итого** | | **11-18 дней** | |

---

## 6. Риски и открытые вопросы

### Риски

1. **Доступ к платформе MAX для разработчиков** — требуется регистрация юрлица или ИП на МСП.РФ или размещение в RuStore. Это может быть блокером.
2. **Незрелость API** — MAX API относительно новый (GitHub-организация создана в феврале 2025). Возможны баги и изменения API.
3. **Отсутствие `my_chat_member` аналога** — Нужно найти способ определять удаление бота из группы.
4. **Форум-топики** — Функция анализа по топикам не будет работать в MAX.
5. **Малая аудитория MAX** — Необходимо подтвердить наличие целевых сообществ в MAX.

### Открытые вопросы

1. Какие типы `update_type` поддерживает MAX webhook? (Полный список не найден в публичной документации)
2. Есть ли аналог `chat_join_request` для заявок на вступление?
3. Как определить, что бота удалили из группы?
4. Какой формат deep link для Mini App в MAX?
5. Поддерживает ли MAX закрытые/приватные группы с модерацией?

### Рекомендация

Начать с **Фазы 0** (подготовка абстракции), которая ничего не ломает в текущем коде. Параллельно зарегистрировать бота на dev.max.ru и протестировать основные API-методы. Принять решение о полном внедрении после подтверждения работоспособности API и наличия аудитории.

---

## 7. Приоритет относительно текущего роадмапа

Интеграция MAX — это **горизонтальное расширение** (новый канал), а не вертикальное (новая функция). Рекомендуемый момент для начала:

- **Фаза 0** — можно начать сейчас (не мешает текущей работе)
- **Фазы 1-4** — после завершения текущего ICP-роадмапа (события + аналитика + биллинг), т.е. **конец марта — апрель 2026**

Это позволит:
1. Не отвлекаться от ICP-A приоритетов
2. К моменту интеграции MAX иметь зрелый и стабильный продукт
3. Использовать MAX как дополнительный канал привлечения (ICP-B, корпоративные клиенты)

---

*Создано: 10 февраля 2026*
