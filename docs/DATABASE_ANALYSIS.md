# Анализ структуры базы данных проекта Orbo

## Дата анализа: 16 октября 2025

---

## 1. ОСНОВНЫЕ ТАБЛИЦЫ (активно используются)

### `organizations`
**Назначение:** Хранение организаций (пространств клиентов)  
**Использование:** Везде - основная сущность проекта  
**Поля:** `id`, `name`, `plan`, `logo_url`, `created_at`  
**Статус:** ✅ Активно используется

### `memberships`
**Назначение:** Связь пользователей с организациями и их ролями  
**Использование:** Контроль доступа, проверка прав, RLS политики  
**Поля:** `org_id`, `user_id`, `role` (owner/admin/member/viewer), `role_source`, `metadata`, `created_at`  
**Статус:** ✅ Активно используется

### `telegram_groups`
**Назначение:** Хранение информации о Telegram-группах  
**Использование:** Интеграция с Telegram, аналитика, sync участников  
**Поля:** `id`, `tg_chat_id`, `title`, `invite_link`, `bot_status`, `org_id` (через org_telegram_groups), `last_sync_at`, и др.  
**Статус:** ✅ Активно используется

### `org_telegram_groups`
**Назначение:** Many-to-many связь между организациями и Telegram-группами  
**Использование:** Одна группа может принадлежать нескольким организациям  
**Поля:** `org_id`, `tg_chat_id`, `created_by`, `created_at`  
**Статус:** ✅ Активно используется

### `participants`
**Назначение:** Участники организаций (члены Telegram-групп, гости событий)  
**Использование:** CRM, аналитика, регистрация на события  
**Поля:** `id`, `org_id`, `tg_user_id`, `username`, `full_name`, `email`, `phone`, `user_id`, `merged_into`, `participant_status`, `bio`, и др.  
**Статус:** ✅ Активно используется, критично важна

### `participant_groups`
**Назначение:** Связь участников с Telegram-группами  
**Использование:** Отслеживание членства в группах, расчет активности  
**Поля:** `participant_id`, `tg_group_id`, `joined_at`, `left_at`  
**Статус:** ✅ Активно используется

### `activity_events`
**Назначение:** События активности (сообщения, join/leave, реакции)  
**Использование:** Аналитика активности, дашборд, метрики  
**Поля:** `id`, `org_id`, `event_type`, `participant_id`, `tg_user_id`, `tg_chat_id`, `message_id`, `has_media`, `chars_count`, `created_at`, `meta`  
**Статус:** ✅ Активно используется

### `participant_messages`
**Назначение:** Хранение текстов сообщений участников для анализа  
**Использование:** Будущий AI-анализ, формирование профилей участников  
**Поля:** `id`, `org_id`, `participant_id`, `tg_user_id`, `tg_chat_id`, `message_id`, `message_text`, `chars_count`, `words_count`, `sent_at`, `analysis_data`, `message_tsv` (полнотекстовый поиск)  
**Статус:** ✅ Недавно добавлена, активно используется

### `user_telegram_accounts`
**Назначение:** Связь auth.users с Telegram ID по организациям  
**Использование:** Верификация Telegram аккаунтов, авторизация  
**Поля:** `id`, `user_id`, `org_id`, `telegram_user_id`, `telegram_username`, `telegram_first_name`, `telegram_last_name`, `is_verified`, `verification_code`, `verified_at`  
**Статус:** ✅ Активно используется (создана в `telegram_ownership_system.sql`, не в миграциях!)

### `events`
**Назначение:** События/мероприятия организаций  
**Использование:** Система событий, регистрация, календарь  
**Поля:** `id`, `org_id`, `title`, `description`, `cover_image_url`, `event_type`, `location_info`, `event_date`, `start_time`, `end_time`, `is_paid`, `price_info`, `capacity`, `status`, `is_public`, `created_by`, `created_at`  
**Статус:** ✅ Активно используется

### `event_registrations`
**Назначение:** Регистрации участников на события  
**Использование:** Управление участниками событий, контроль capacity  
**Поля:** `id`, `event_id`, `participant_id`, `registered_at`, `registration_source`, `status` (registered/cancelled)  
**Статус:** ✅ Активно используется

### `material_pages`
**Назначение:** Страницы материалов (база знаний)  
**Использование:** Хранение документации, материалов для участников  
**Поля:** `id`, `org_id`, `parent_id`, `title`, `slug`, `content_md`, `content_draft_md`, `visibility`, `is_published`, `position`, `created_by`, `updated_by`  
**Статус:** ✅ Активно используется

### `telegram_auth_codes`
**Назначение:** Одноразовые коды для авторизации через Telegram бота  
**Использование:** Альтернатива Telegram Login Widget, более безопасная  
**Поля:** `id`, `code`, `org_id`, `event_id`, `redirect_url`, `is_used`, `used_at`, `telegram_user_id`, `telegram_username`, `expires_at`  
**Статус:** ✅ Активно используется

---

## 2. ВСПОМОГАТЕЛЬНЫЕ ТАБЛИЦЫ (используются ограниченно)

### `event_telegram_notifications`
**Назначение:** Уведомления о событиях в Telegram группы  
**Использование:** Cron-задачи для отправки напоминаний о событиях  
**Поля:** `id`, `event_id`, `tg_group_id`, `notification_type`, `scheduled_at`, `sent_at`, `message_id`, `status`, `error_message`  
**Использование в коде:** 
- `app/api/cron/event-notifications/route.ts` (основной cron)
- `app/api/events/[id]/notify/route.ts` (ручная отправка)  
**Статус:** ⚠️ Используется, но ограниченно (только для нотификаций)

### `organization_invites`
**Назначение:** Приглашения для доступа к организациям  
**Использование:** Система инвайтов с разными уровнями доступа  
**Поля:** `id`, `org_id`, `token`, `created_by`, `access_type`, `allowed_materials`, `allowed_events`, `max_uses`, `current_uses`, `expires_at`, `is_active`  
**Использование в коде:**
- `app/api/organizations/[id]/invites/route.ts`
- `app/join/[org]/[token]/page.tsx`
- `app/app/[org]/settings/invites/page.tsx`  
**Статус:** ⚠️ Используется, но не критично

### `organization_invite_uses`
**Назначение:** Аудит использования приглашений  
**Использование:** Логирование кто и когда использовал инвайт  
**Поля:** `id`, `invite_id`, `user_id`, `telegram_user_id`, `telegram_username`, `used_at`, `ip_address`, `user_agent`  
**Статус:** ⚠️ Используется для аудита

### `user_group_admin_status`
**Назначение:** Хранение информации об админ-статусе пользователей в группах  
**Использование:** Синхронизация админ-прав из Telegram  
**Поля:** `id`, `user_id`, `tg_chat_id`, `is_admin`, `checked_at`  
**Использование в коде:**
- `lib/server/syncOrgAdmins.ts`
- `app/api/telegram/bot/check-user-groups/route.ts`
- Migrations 02, 20, 31, 37, 40, 41  
**Статус:** ⚠️ Используется для синхронизации админов

### `group_metrics`
**Назначение:** Агрегированные метрики по группам (DAU, сообщения, и т.д.)  
**Использование:** Аналитика, дашборды  
**Поля:** `id`, `org_id`, `tg_chat_id`, `date`, `dau`, `message_count`, `reply_count`, `reply_ratio`, `join_count`, `leave_count`, `net_member_change`, `silent_rate`  
**Использование в коде:**
- `lib/services/eventProcessingService.ts` (агрегация)
- `app/api/telegram/webhook/route.ts` (обновление)
- `app/app/[org]/telegram/analytics/page.tsx` (отображение)
- `app/app/[org]/telegram/groups/[groupId]/page.tsx` (детали группы)  
**Статус:** ⚠️ Используется, но может быть заменена на-лету вычисляемыми метриками

### `material_page_history`
**Назначение:** История версий страниц материалов  
**Использование:** Версионирование контента  
**Поля:** `id`, `page_id`, `org_id`, `version`, `content_md`, `editor_id`, `created_at`, `meta`  
**Статус:** ⚠️ Используется для версионирования

### `material_page_locks`
**Назначение:** Блокировки страниц материалов при редактировании  
**Использование:** Предотвращение конфликтов при одновременном редактировании  
**Поля:** `page_id`, `org_id`, `locked_by`, `locked_at`, `expires_at`  
**Статус:** ⚠️ Используется для collaborative editing

### `material_search_index`
**Назначение:** Поисковый индекс для материалов  
**Использование:** Полнотекстовый поиск по материалам  
**Поля:** `page_id`, `org_id`, `title`, `content_ts` (tsvector)  
**Статус:** ⚠️ Используется для поиска

---

## 3. ИНТЕГРАЦИОННЫЕ ТАБЛИЦЫ (используются для интеграций)

### `integration_connectors`
**Назначение:** Типы доступных интеграций (GetCourse, AmoCRM, и т.д.)  
**Использование:** Справочник интеграций  
**Поля:** `id`, `code`, `name`, `description`, `category`, `created_at`, `updated_at`  
**Статус:** ⚠️ Используется, но только GetCourse и AmoCRM реализованы

### `integration_connections`
**Назначение:** Конфигурации интеграций для организаций  
**Использование:** Хранение настроек подключений  
**Поля:** `id`, `org_id`, `connector_id`, `status`, `sync_mode`, `schedule_cron`, `last_sync_at`, `credentials_encrypted`, `config`  
**Статус:** ⚠️ Используется для интеграций

### `integration_jobs`
**Назначение:** Задачи синхронизации для интеграций  
**Использование:** Логирование и управление джобами синхронизации  
**Поля:** `id`, `connection_id`, `job_type`, `status`, `started_at`, `finished_at`, `result`, `error`  
**Статус:** ⚠️ Используется для джобов

### `integration_job_logs`
**Назначение:** Детальные логи выполнения джобов  
**Использование:** Отладка интеграций  
**Поля:** `id`, `job_id`, `level`, `message`, `context`, `created_at`  
**Статус:** ⚠️ Используется для логирования

### `participant_external_ids`
**Назначение:** Связь участников с внешними системами (GetCourse ID, AmoCRM ID)  
**Использование:** Маппинг между Orbo и внешними CRM  
**Поля:** `id`, `participant_id`, `org_id`, `system_code`, `external_id`, `url`, `data`  
**Статус:** ⚠️ Используется для интеграций

---

## 4. УСТАРЕВШИЕ/НЕИСПОЛЬЗУЕМЫЕ ТАБЛИЦЫ

### `telegram_identities` ❌
**Назначение:** Глобальные Telegram идентичности (замысел - один tg_user_id = одна запись)  
**Проблема:** 
- Изначально задумана как центральная таблица для всех Telegram пользователей
- В коде НЕ используется активно
- `participants.identity_id` есть, но не используется
- Заменена на `user_telegram_accounts` для связи с auth.users
- Код в `app/api/telegram/analytics/data/route.ts` ЗАКОММЕНТИРОВАН (пытался искать `full_name`, которого нет)  
**Использование в коде:** Только в миграциях 10, 11, 12  
**Рекомендация:** ❌ УДАЛИТЬ или мигрировать данные в `user_telegram_accounts`

### `telegram_activity_events` ❌
**Назначение:** Дубликат/предшественник `activity_events` для Telegram событий  
**Проблема:**
- Функционал полностью дублирует `activity_events`
- В текущем коде используется `activity_events`, а не эта таблица
- Ссылается на `identity_id` из `telegram_identities` (которая не используется)  
**Использование в коде:** 
- Упоминается в миграции 11, 12
- Упоминается в документации `TELEGRAM_ANALYTICS_FIX.md`
- НЕ используется в рабочем коде  
**Рекомендация:** ❌ УДАЛИТЬ

### `telegram_updates` ❌
**Назначение:** Хранение ID обработанных Telegram обновлений для идемпотентности  
**Проблема:**
- В коде webhook НЕ используется
- Идемпотентность сейчас не реализована через БД (можно делать через Redis или in-memory)
- Таблица создана, но нигде не применяется  
**Использование в коде:** Только в миграции 04, упоминается в `lib/services/eventProcessingService.ts` (закомментировано?)  
**Рекомендация:** ⚠️ Либо реализовать идемпотентность, либо удалить

### `telegram_bots` ❌
**Назначение:** Хранение токенов дополнительных ботов (notifications bot, и т.д.)  
**Проблема:**
- В коде используются переменные окружения `TELEGRAM_BOT_TOKEN` и `TELEGRAM_NOTIFICATIONS_BOT_TOKEN`
- Таблица НЕ используется в рабочем коде
- Функционал множественных ботов на организацию не реализован  
**Использование в коде:** 
- Только в миграции 04
- Упоминается в `app/api/telegram/bot/notifications/setup/route.ts` и `app/api/telegram/notifications/send/route.ts`, но эти файлы не используются в основном flow  
**Рекомендация:** ⚠️ Если не планируется функционал per-org ботов, удалить

### `profiles` (таблица из auth schema?) ⚠️
**Назначение:** Расширение auth.users для хранения дополнительных полей  
**Проблема:**
- Упоминается в миграциях (02, 04), но не в основных миграциях схемы
- В коде используется только в 2 местах: `app/api/telegram/notifications/webhook/route.ts` и `app/api/user/telegram-id/route.ts`
- Функционал профилей не развит, поля `telegram_user_id`, `telegram_notifications_enabled`, `activity_score`, `risk_score` добавлены, но не используются активно
- Конфликтует с `user_telegram_accounts`  
**Рекомендация:** ⚠️ Либо мигрировать на `user_telegram_accounts`, либо удалить дублирующие поля

### `material_folders` и `material_items` ⚠️
**Назначение:** Старая система материалов (папки + айтемы)  
**Проблема:**
- Создана в `01_initial_schema.sql`
- Заменена на `material_pages` в миграции 17
- В текущем коде используется `material_pages`, а не folders/items  
**Рекомендация:** ⚠️ Проверить использование, если не используется - удалить

### `material_access` ⚠️
**Назначение:** Детальный доступ к материалам (по группам или участникам)  
**Проблема:**
- Создана в `01_initial_schema.sql`
- В текущем коде `material_pages` имеет поле `visibility` ('org_members' или 'admins_only')
- Гранулярный доступ не реализован  
**Рекомендация:** ⚠️ Если не используется - удалить

---

## 5. ДОПОЛНИТЕЛЬНЫЕ ТАБЛИЦЫ (служебные)

### `telegram_verification_logs`
**Назначение:** Логи попыток верификации Telegram аккаунтов  
**Поля:** `id`, `user_id`, `org_id`, `telegram_user_id`, `verification_code`, `action`, `ip_address`, `user_agent`, `success`, `error_message`  
**Статус:** ⚠️ Создана в `telegram_ownership_system.sql`, используется для аудита

### `telegram_group_admins`
**Назначение:** Список админов Telegram групп  
**Поля:** `id`, `tg_chat_id`, `telegram_user_id`, `is_admin`, `custom_title`, `is_anonymous`, `can_manage_chat`, и т.д.  
**Статус:** ⚠️ Создана в `telegram_ownership_system.sql`, используется для синхронизации

---

## 6. ПРЕДЛОЖЕНИЯ ПО ОПТИМИЗАЦИИ СТРУКТУРЫ БД

### 🔴 КРИТИЧНО - Удалить

1. **`telegram_identities`** - не используется, заменена на `user_telegram_accounts`
   - Удалить таблицу
   - Удалить `participants.identity_id` FK
   - Удалить все упоминания в коде

2. **`telegram_activity_events`** - полностью дублирует `activity_events`
   - Удалить таблицу
   - Удалить все упоминания в миграциях/документации

3. **`telegram_updates`** - создана, но не используется
   - Либо реализовать идемпотентность через эту таблицу
   - Либо удалить (Redis/in-memory лучше)

### 🟡 РАССМОТРЕТЬ - Проверить и решить

4. **`telegram_bots`** - не используется, функционал per-org ботов не реализован
   - Если не планируется - удалить
   - Если планируется - реализовать использование

5. **`material_folders`, `material_items`, `material_access`** - старая система материалов
   - Проверить, есть ли данные в этих таблицах
   - Если нет - удалить
   - Если есть - мигрировать на `material_pages`

6. **`profiles.telegram_user_id`** - дублирует `user_telegram_accounts`
   - Мигрировать все поля в `user_telegram_accounts`
   - Удалить дублирующие поля из `profiles`

7. **`group_metrics`** - можно заменить на вычисляемые представления (views)
   - Рассмотреть materialized views вместо таблицы
   - Уменьшит сложность синхронизации

### 🟢 УЛУЧШИТЬ - Оптимизация

8. **Добавить индексы:**
   - `participants(email)` - для быстрого поиска по email
   - `participant_messages(analyzed_at)` - для поиска неанализированных сообщений
   - `event_registrations(status, event_id)` - для подсчета registered

9. **Добавить CHECK constraints:**
   - `events.end_time > start_time`
   - `telegram_auth_codes.expires_at > created_at`
   - `organization_invites.current_uses <= max_uses`

10. **Добавить COMMENT для всех таблиц и важных колонок**
    - Улучшит понимание схемы для разработчиков

11. **Консолидировать миграции:**
    - 41 миграция - это много для MVP
    - Создать один consolidated migration file с финальной схемой
    - Упростит деплой на новые окружения

---

## 7. ИТОГОВАЯ СТАТИСТИКА

**Всего таблиц:** ~30-35

**Активно используются:** 13 таблиц  
**Используются ограниченно:** 12 таблиц  
**Не используются / устаревшие:** 5-7 таблиц

**Рекомендации:**
- Удалить: 3 таблицы сразу (`telegram_identities`, `telegram_activity_events`, `telegram_updates`)
- Проверить и решить: 4 таблицы
- Оптимизировать: добавить индексы, constraints, комментарии
- Консолидировать миграции

**Ожидаемый эффект:**
- Упрощение схемы на 15-20%
- Улучшение производительности за счет индексов
- Снижение технического долга
- Более понятная документация

---

## 8. ПЛАН ДЕЙСТВИЙ

### Этап 1: Безопасное удаление (без риска)
1. Удалить `telegram_updates` (не используется)
2. Удалить `telegram_activity_events` (дубликат)

### Этап 2: Миграция данных
3. Проверить, есть ли данные в `telegram_identities`
4. Если есть - мигрировать в `user_telegram_accounts`
5. Удалить `telegram_identities` и `participants.identity_id`

### Этап 3: Проверка старых таблиц
6. Проверить использование `material_folders`, `material_items`, `material_access`
7. Если не используются - удалить
8. Проверить `telegram_bots` - либо реализовать, либо удалить

### Этап 4: Оптимизация
9. Добавить недостающие индексы
10. Добавить CHECK constraints
11. Добавить COMMENT для всех таблиц

### Этап 5: Консолидация (опционально)
12. Создать consolidated migration file
13. Упростить структуру папки migrations

---

**Примечание:** Все действия должны выполняться с backup'ом базы данных!


