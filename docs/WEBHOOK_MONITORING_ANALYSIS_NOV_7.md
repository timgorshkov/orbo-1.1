# Анализ текущего состояния Webhook Monitoring — 7 ноября 2025

## ✅ Что УЖЕ реализовано:

### **1. Database Schema (Migration 076)** ✅ DONE
Создано **3 таблицы** для observability:

#### `error_logs` — Общее логгирование ошибок
- **Назначение:** Логгирование всех ошибок приложения
- **Retention:** 30 дней (автоочистка)
- **Поля:** level, message, error_code, context (JSONB), stack_trace, fingerprint (для дедупликации)
- **RPC:** `log_error()` — helper для логгирования
- **Cleanup:** `cleanup_error_logs()` — удаляет записи старше 30 дней

#### `telegram_health_events` — Health мониторинг
- **Назначение:** Логгирование событий здоровья Telegram ботов
- **Retention:** 7 дней (автоочистка)
- **Event types:** webhook_success, webhook_failure, admin_check_success, sync_failure, bot_removed, bot_added
- **Статусы:** healthy, degraded, unhealthy
- **RPC:** 
  - `log_telegram_health()` — записывает событие
  - `get_telegram_health_status(tg_chat_id)` — возвращает статус группы за последние 7 дней
- **Cleanup:** `cleanup_health_events()` — удаляет записи старше 7 дней

#### `admin_action_log` — Audit log
- **Назначение:** Логгирование действий админов
- **Retention:** 90 дней (автоочистка)
- **Поля:** action, resource_type, resource_id, changes (JSONB), metadata, ip_address
- **RPC:** `log_admin_action()` — helper для логгирования
- **Cleanup:** `cleanup_admin_action_log()` — удаляет записи старше 90 дней

---

### **2. Cron Jobs** ✅ DONE

#### `/api/cron/check-webhook` — Автовосстановление webhook
- **Расписание:** Каждые 30 минут (`*/30 * * * *`)
- **Функционал:**
  - Проверяет текущий webhook через `getWebhookInfo`
  - Определяет, нужно ли восстанавливать (URL не совпадает или есть ошибки)
  - Автоматически восстанавливает webhook через `setWebhook`
  - Логгирует результат в консоль
- **Что ХОРОШО:** ✅ Автовосстановление работает
- **Что НЕ ХВАТАЕТ:** ❌ НЕ пишет в `telegram_health_events` (нет persistence)

#### `/api/cron/telegram-health-check` — Health monitoring
- **Расписание:** Каждые 10 минут (`*/10 * * * *`)
- **Функционал:**
  - Проверяет все группы из `telegram_groups`
  - Определяет статус по `last_sync_at`:
    - `healthy`: активность < 15 минут назад
    - `degraded`: активность 15-60 минут назад
    - `unhealthy`: активность >60 минут назад или нет вообще
  - **ВАЖНО:** ✅ Пишет в `telegram_health_events` через `log_telegram_health()` при degraded/unhealthy
  - Запускает cleanup функции для старых логов
- **Что ХОРОШО:** ✅ Мониторинг работает, пишет в БД
- **Что НЕ ХВАТАЕТ:** ❌ Нет алертов при критических сбоях

---

### **3. API Endpoints** ✅ DONE

#### `/api/telegram/health` — Health status API
- **Назначение:** Возвращает текущий статус всех Telegram групп
- **Функционал:**
  - Читает все группы из `telegram_groups`
  - Для каждой группы вызывает `get_telegram_health_status()`
  - Рассчитывает `overall_status`: healthy/degraded/unhealthy
  - Возвращает summary + детали по каждой группе
- **Что ХОРОШО:** ✅ API работает
- **Что НЕ ХВАТАЕТ:** ❌ Нет кеширования (каждый запрос = N+1 RPC вызовов)

#### `/api/superadmin/telegram/setup-webhook` — Webhook setup
- **Назначение:** Настройка webhook для main/notifications ботов
- **GET:** Получает текущую информацию о webhook
- **POST:** Настраивает webhook для указанного бота
- **Что ХОРОШО:** ✅ Работает для обоих ботов
- **Что НЕ ХВАТАЕТ:** ❌ Нет валидации allowed_updates для `message_reaction`

---

### **4. UI Components** ⚠️ PARTIALLY WORKING

#### `TelegramHealthStatus` — Виджет статуса в суперадминке
- **Расположение:** `/superadmin/telegram`
- **Функционал:**
  - Вызывает `/api/telegram/health` каждые 2 минуты
  - Показывает: total_groups, healthy, unhealthy, overall_status
  - Цветовая индикация: green (healthy), yellow (degraded), red (unhealthy)
- **ПРОБЛЕМА:** ⚠️ **НЕРАБОТОСПОСОБЕН** (по словам пользователя)
  - **Возможные причины:**
    1. RPC `get_telegram_health_status()` возвращает пустые данные (нет событий в `telegram_health_events`)
    2. API `/api/telegram/health` падает с ошибкой (нужно проверить логи)
    3. Frontend не обрабатывает null/undefined правильно
    4. RLS блокирует доступ к данным

#### `WebhookSetup` — Виджет настройки webhook
- **Расположение:** `/superadmin/telegram`
- **Функционал:**
  - Показывает текущий webhook для main/notifications ботов
  - Кнопка "Setup Webhook" для переустановки
  - Показывает pending updates, last error, allowed updates
- **Что ХОРОШО:** ✅ Работает корректно
- **Что НЕ ХВАТАЕТ:** ❌ Нет предупреждения, если missing `message_reaction` in allowed_updates

---

## ❌ Что НЕ РАБОТАЕТ / НЕ ХВАТАЕТ:

### **1. Виджет `TelegramHealthStatus` не показывает данные** 🔴 CRITICAL
**Возможные причины:**

#### Причина A: Нет событий в `telegram_health_events`
- **Проверка:** `SELECT COUNT(*) FROM telegram_health_events;`
- **Если 0:** Cron job `/api/cron/telegram-health-check` не пишет события
  - **Возможно:** Все группы имеют `last_sync_at < 15 min` (healthy) → не пишутся в БД
  - **Решение:** Изменить логику — писать **ВСЕ** события (включая healthy), а не только degraded/unhealthy

#### Причина B: RPC `get_telegram_health_status()` возвращает NULL
- **Проверка:** Вручную вызвать `SELECT * FROM get_telegram_health_status(123456);`
- **Если NULL:** Функция не находит данные за последние 7 дней
  - **Возможно:** События есть, но старше 7 дней (были удалены cleanup'ом)
  - **Решение:** Увеличить retention до 30 дней или писать события чаще

#### Причина C: RLS блокирует доступ
- **Проверка:** Проверить, что суперадмин имеет доступ к `telegram_health_events`
- **Решение:** Добавить политику для суперадминов (если её нет)

#### Причина D: Frontend ошибка
- **Проверка:** Открыть `/superadmin/telegram` и посмотреть Console/Network в DevTools
- **Если 500 error:** API падает → проверить логи Vercel
- **Если 200 OK, но нет данных:** Frontend не обрабатывает пустой response
  - **Решение:** Добавить fallback UI для пустых данных

---

### **2. Нет алертов при критических сбоях** 🟡 MEDIUM PRIORITY
**Что нужно:**
- Email уведомление суперадмину, если:
  - Webhook disconnected >1 час
  - >50% групп unhealthy
  - Cron job failed 3+ раз подряд
- **Решение:** 
  - Добавить email sender (Resend API)
  - Добавить RPC `check_critical_health()` в cron job
  - Если critical → отправить email

---

### **3. Cron job `/api/cron/check-webhook` не пишет в БД** 🟡 MEDIUM PRIORITY
**Что нужно:**
- Записывать результаты проверки webhook в `telegram_health_events`
- **Решение:** Добавить вызов `log_telegram_health()` после каждой проверки/восстановления

---

### **4. Нет structured logging (Pino)** 🟡 MEDIUM PRIORITY
**Что нужно:**
- Заменить `console.log/error` на structured logging
- **Решение:** 
  - Установить `pino` + `pino-pretty`
  - Создать `lib/logger.ts` с экземпляром Pino
  - Заменить все `console.*` на `logger.*`
  - Интеграция с Vercel Logs

---

### **5. Нет Error Dashboard UI** 🟡 MEDIUM PRIORITY
**Что нужно:**
- Страница `/superadmin/errors` для просмотра логов из `error_logs`
- Фильтры: level, org, date range, error_code
- Группировка по fingerprint (дедупликация)
- Кнопка "Mark as resolved"
- **Решение:** Создать компонент `ErrorDashboard` + API endpoint

---

### **6. Нет Admin Audit Log UI** 🟢 LOW PRIORITY (уже есть таблица, нужен только UI)
**Что нужно:**
- Страница `/superadmin/audit` для просмотра логов из `admin_action_log`
- Фильтры: user, org, action, resource_type, date range
- **Решение:** Создать компонент `AuditLog` + API endpoint

---

### **7. Нет вызовов `log_admin_action()` в коде** 🟢 LOW PRIORITY
**Что нужно:**
- Добавить вызов `log_admin_action()` во все критические операции:
  - Удаление участника
  - Merge участников
  - Удаление группы
  - Изменение настроек org
- **Решение:** Добавить обертку `withAdminAudit(action, resourceType, resourceId, fn)` в `lib/server/auditLogger.ts`

---

## 🎯 Recommended Action Plan (Week 1):

### **Day 1-2: Fix TelegramHealthStatus Widget** 🔴 CRITICAL
1. **Debug причину неработоспособности:**
   - Проверить `/api/telegram/health` в Vercel logs
   - Проверить `SELECT * FROM telegram_health_events;` в Supabase
   - Проверить Network tab в браузере
2. **Fix проблему:**
   - Если нет событий → изменить cron job писать **все** события (включая healthy)
   - Если RLS блокирует → добавить политику для суперадминов
   - Если frontend ошибка → добавить fallback UI
3. **Test:** Виджет должен показывать real-time данные
4. **Deploy:** После фикса

---

### **Day 3-4: Structured Logging (Pino)** 🟡
1. **Install Pino:**
   ```bash
   npm install pino pino-pretty
   ```
2. **Create `lib/logger.ts`:**
   ```typescript
   import pino from 'pino';
   export const logger = pino({
     level: process.env.LOG_LEVEL || 'info',
     formatters: {
       level: (label) => ({ level: label })
     }
   });
   ```
3. **Replace all `console.*`:**
   - Find: `console.log` → Replace: `logger.info`
   - Find: `console.error` → Replace: `logger.error`
   - Find: `console.warn` → Replace: `logger.warn`
4. **Test:** Logs должны быть в JSON формате в Vercel
5. **Deploy:** После замены

---

### **Day 5-7: Error Dashboard UI** 🟡
1. **Create API endpoint:** `/api/superadmin/errors`
   - GET: Fetch recent errors from `error_logs`
   - PATCH: Mark error as resolved
2. **Create page:** `/superadmin/errors`
   - Table: timestamp, level, message, error_code, org, resolved_at
   - Filters: level, org, date range, error_code
   - Pagination: 50 per page
   - Action: "Mark as Resolved" button
3. **Add link to sidebar:** "Ошибки" (link to `/superadmin/errors`)
4. **Test:** Errors должны отображаться и фильтроваться
5. **Deploy:** После тестирования

---

## 📊 Summary: What's Working vs Not Working

| Component | Status | Notes |
|-----------|--------|-------|
| **Database Schema** | ✅ DONE | All tables & RPC functions exist |
| **Cron: check-webhook** | ⚠️ PARTIAL | Works, but doesn't log to DB |
| **Cron: telegram-health-check** | ✅ DONE | Works, logs to DB, cleanup |
| **API: /api/telegram/health** | ✅ DONE | Works, but no caching |
| **API: /api/superadmin/telegram/setup-webhook** | ✅ DONE | Works for both bots |
| **UI: TelegramHealthStatus** | ❌ BROKEN | User reports: неработоспособный |
| **UI: WebhookSetup** | ✅ DONE | Works correctly |
| **Structured Logging (Pino)** | ❌ NOT DONE | Still using console.* |
| **Error Dashboard UI** | ❌ NOT DONE | Table exists, no UI |
| **Audit Log UI** | ❌ NOT DONE | Table exists, no UI |
| **Email Alerts** | ❌ NOT DONE | No alerting on critical failures |
| **Admin Audit Logging (calls)** | ❌ NOT DONE | Function exists, not called in code |

---

## ✅ Immediate Next Steps:

### **1. Debug TelegramHealthStatus widget (Day 1)** 🔴
- [ ] Check Vercel logs for `/api/telegram/health` errors
- [ ] Query Supabase: `SELECT * FROM telegram_health_events LIMIT 10;`
- [ ] Check browser DevTools Network tab
- [ ] Identify root cause
- [ ] Fix issue
- [ ] Test in production
- [ ] Deploy fix

### **2. Structured Logging (Day 2-3)** 🟡
- [ ] Install Pino
- [ ] Create logger utility
- [ ] Replace console.* in all files
- [ ] Test locally
- [ ] Deploy

### **3. Error Dashboard UI (Day 4-7)** 🟡
- [ ] Create API endpoint
- [ ] Create UI page
- [ ] Add to sidebar
- [ ] Test
- [ ] Deploy

---

**Total Estimated Time for Week 1:** 5-7 days (Block 0.1 completion)

**Status:** ⚠️ ~50% реализовано (DB + Cron + API), но UI неработоспособен

