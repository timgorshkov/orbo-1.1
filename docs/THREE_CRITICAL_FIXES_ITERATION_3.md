# Исправление трёх критических проблем - Итерация 3

## Обзор исправлений

### 1. ✅ Dashboard Activity - дублирование статистики
**Проблема:** Каждое сообщение фиксировалось несколько раз (по разу для каждой организации, в которой есть группа), что приводило к завышенным показателям.

**Решение:** Вместо использования `activity_events` (где каждое сообщение дублируется для каждой организации), теперь используется `group_metrics` - агрегированные дневные метрики по группам. Это та же логика, что и на странице аналитики группы.

**Изменённые файлы:**
- `app/api/dashboard/[orgId]/route.ts` - переход на `group_metrics` с фильтрацией по `org_id`

**Преимущества:**
- Нет дублирования данных
- Быстрее работает (агрегированные данные)
- Консистентность с аналитикой группы

---

### 2. ✅ Telegram Admin Sync - отсутствие колонок `created_at` и `updated_at`
**Проблема:** Ошибка `record "new" has no field "updated_at"` при попытке обновить права администраторов. Триггер `update_telegram_group_admins_updated_at()` пытался установить `updated_at`, но этой колонки не существовало в таблице.

**Решение:** Создана новая миграция `50_add_timestamps_to_telegram_group_admins.sql`, которая:
- Добавляет `created_at` если отсутствует
- Добавляет `updated_at` если отсутствует
- Пересоздаёт триггер для автоматического обновления `updated_at`

**Новые файлы:**
- `db/migrations/50_add_timestamps_to_telegram_group_admins.sql`

**Инструкция по применению:**
```sql
-- Выполните миграцию в SQL Editor Supabase:
-- 1. Откройте db/migrations/50_add_timestamps_to_telegram_group_admins.sql
-- 2. Скопируйте содержимое
-- 3. Вставьте в SQL Editor и нажмите RUN
```

---

### 3. ✅ Root Page Redirect - добавлена диагностика
**Проблема:** Пользователь сообщил, что корневая страница редиректит на `/signin` вместо `/orgs`, даже при наличии активной сессии.

**Анализ:**
- Ошибка `NEXT_REDIRECT` в логах - это НЕ ошибка, а нормальная работа `redirect()` в Next.js
- Корневая страница (`app/page.tsx`) корректно редиректит на `/orgs` при наличии сессии
- Возможная проблема: `/orgs/page.tsx` не получает сессию после редиректа

**Решение:** Добавлена подробная диагностика в `/orgs/page.tsx` для отслеживания состояния аутентификации.

**Изменённые файлы:**
- `app/orgs/page.tsx` - добавлено логирование для диагностики

**Для тестирования:**
1. Откройте корневую страницу `app.orbo.ru` в авторизованной сессии
2. Проверьте логи Vercel:
   - `[Root Page] User authenticated, redirecting to /orgs` - корневая страница видит пользователя
   - `[Orgs Page] Loading organizations page...` - страница /orgs загружается
   - `[Orgs Page] User check: { hasUser: true/false, hasError: true/false }` - состояние пользователя на /orgs
3. Если на странице `/orgs` `hasUser: false`, это означает, что сессия не передаётся между страницами

---

## Порядок применения изменений

### Шаг 1: Применить миграцию 50
```bash
# В Supabase SQL Editor:
# 1. Откройте db/migrations/50_add_timestamps_to_telegram_group_admins.sql
# 2. Скопируйте весь SQL
# 3. Вставьте в SQL Editor
# 4. Нажмите RUN

# Ожидаемый вывод:
# NOTICE:  Added created_at column to telegram_group_admins (или "already exists")
# NOTICE:  Added updated_at column to telegram_group_admins (или "already exists")
# NOTICE:  Migration 50: telegram_group_admins timestamps are ready
```

### Шаг 2: Задеплоить изменения в коде
Изменённые файлы автоматически задеплоятся в Vercel при push в репозиторий.

### Шаг 3: Проверить исправления

#### 3.1 Dashboard Activity
1. Откройте Dashboard организации
2. Проверьте блок "Activity for 14 days"
3. Убедитесь, что числа реалистичны (не завышены)
4. Сравните с аналитикой отдельных групп - должны совпадать

#### 3.2 Telegram Admin Sync
1. Откройте "Настройка Telegram аккаунта"
2. Нажмите "Обновить права администраторов"
3. Должно появиться сообщение вида "Обновлены права администраторов: X из Y"
4. Проверьте логи Vercel - НЕ должно быть ошибок `record "new" has no field "updated_at"`
5. Откройте "Настройки - Команда организации"
6. Админы из Telegram групп должны появиться в списке

#### 3.3 Root Page Redirect
1. Откройте `app.orbo.ru` в авторизованной сессии
2. Вас должно перекинуть на `/orgs`
3. Проверьте логи Vercel:
   - Должны быть логи `[Root Page] User authenticated, redirecting to /orgs`
   - Должны быть логи `[Orgs Page] Loading organizations page...`
   - Должны быть логи `[Orgs Page] User authenticated: <user_id>`
4. Если видите `[Orgs Page] No user found, redirecting to /signin`, сообщите об этом - нужно будет исследовать передачу сессии

---

## Технические детали

### Исправление 1: Dashboard Activity
**До:**
```typescript
// Использовались activity_events, которые дублируются для каждой организации
const result = await adminSupabase
  .from('activity_events')
  .select('created_at, event_type, tg_chat_id')
  .in('tg_chat_id', chatIds)
  .eq('event_type', 'message')
  .gte('created_at', fourteenDaysAgo.toISOString())
```

**После:**
```typescript
// Используются group_metrics - агрегированные данные по дням
const { data: metricsData } = await adminSupabase
  .from('group_metrics')
  .select('date, message_count, tg_chat_id, org_id')
  .in('tg_chat_id', chatIds)
  .eq('org_id', orgId)  // Фильтр по организации избегает дублей
  .gte('date', fourteenDaysAgoStr)
```

### Исправление 2: Telegram Group Admins Timestamps
**Проблема:** Таблица `telegram_group_admins` была создана без колонок `created_at` и `updated_at`, но триггер пытался их использовать.

**Миграция 50:**
- Проверяет наличие колонок через `information_schema.columns`
- Добавляет недостающие колонки с помощью `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- Пересоздаёт триггер для автоматического обновления `updated_at`

### Исправление 3: Root Page Redirect
**Диагностика:** Добавлено логирование в ключевых точках:
1. `app/page.tsx` - логирует результат проверки пользователя
2. `app/orgs/page.tsx` - логирует получение пользователя после редиректа

Если проблема сохраняется, это может указывать на:
- Проблемы с передачей cookies между редиректами
- Проблемы с Supabase клиентом на серверной стороне
- Проблемы с middleware

---

## Известные ограничения

### Dashboard Activity
- Показываются только данные с того дня, когда группа была добавлена в организацию
- Если группа добавлена в несколько организаций, каждая организация видит только свои метрики с момента добавления

### Telegram Admin Sync
- Права администраторов обновляются вручную через кнопку "Обновить права администраторов"
- Автоматическая синхронизация не реализована (требует периодических задач)

---

## Следующие шаги

Если все три исправления работают корректно:
1. ✅ Dashboard показывает корректную статистику без дублей
2. ✅ Админы синхронизируются и появляются в "Команда организации"
3. ✅ Корневая страница редиректит на `/orgs` для авторизованных пользователей

Если какие-то проблемы остаются:
- Предоставьте логи Vercel для диагностики
- Укажите какие именно шаги воспроизводят проблему

