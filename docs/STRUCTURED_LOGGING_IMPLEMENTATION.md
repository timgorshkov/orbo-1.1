# Structured Logging Implementation ✅

**Date:** 7 ноября 2025  
**Status:** COMPLETE  
**Time:** ~2 часа

---

## 🎯 **Цель:**

Заменить `console.log/error` на structured logging (Pino) для:
- ✅ Better observability (JSON logs)
- ✅ Better performance (faster than console.*)
- ✅ Better context (requestId, service, cron name)
- ✅ Production-ready logging

---

## 📦 **1. Установлено:**

```bash
npm install pino pino-pretty
```

**Packages:**
- `pino` - fast structured logger
- `pino-pretty` - pretty formatter for development

---

## 🔧 **2. Logger Utility создан:**

**Файл:** `lib/logger.ts`

### **Основные функции:**

#### **a) `createAPILogger(request, context?)`**
Для API routes, добавляет:
- `requestId` (from Vercel headers)
- `url` и `method`
- Custom context (e.g., `{ orgId: '123' }`)

```typescript
const logger = createAPILogger(req, { webhook: 'main' });
logger.info('Webhook received');
logger.error({ error }, 'Webhook processing failed');
```

#### **b) `createServiceLogger(serviceName, context?)`**
Для сервисов (services/):

```typescript
const logger = createServiceLogger('WeeklyDigestService');
logger.info({ tokens: 1234, costUsd: 0.003 }, 'AI Insights generated');
```

#### **c) `createCronLogger(cronName, context?)`**
Для cron jobs:

```typescript
const logger = createCronLogger('telegram-health-check');
logger.info('Health check started');
logger.info({ healthy: 5, unhealthy: 2 }, 'Health check complete');
```

### **Форматирование:**

**Production (JSON):**
```json
{
  "level": "info",
  "time": "2025-11-07T20:46:51.865Z",
  "requestId": "iad1::abc123",
  "webhook": "main",
  "msg": "Webhook received"
}
```

**Development (Pretty):**
```
[20:46:51] INFO (webhook=main): Webhook received
    requestId: "iad1::abc123"
```

---

## 📝 **3. Замены сделаны:**

### **Priority 1: Telegram Webhook** ✅
**Файл:** `app/api/telegram/webhook/route.ts`

**Что заменили:**
```typescript
// ❌ Before:
console.log('[Main Bot Webhook] ==================== WEBHOOK RECEIVED ====================');
console.error('[Main Bot Webhook] ❌ Unauthorized - secret token mismatch');

// ✅ After:
const logger = createAPILogger(req, { webhook: 'main' });
logger.info('Webhook received');
logger.error({ 
  endpoint: '/api/telegram/webhook',
  botType: 'MAIN',
  expectedSecretLength: secret?.length,
  receivedSecretLength: receivedSecret?.length
}, 'Unauthorized - secret token mismatch');
```

**Преимущества:**
- Structured data (легко парсить)
- requestId автоматически добавляется
- Меньше шума в логах

---

### **Priority 2: Telegram Health Check Cron** ✅
**Файл:** `app/api/cron/telegram-health-check/route.ts`

**Что заменили:**
```typescript
// ❌ Before:
console.log('[Telegram Health Cron] ========== HEALTH CHECK START ==========');
console.log(`[Telegram Health Cron] Checking ${groups?.length || 0} groups`);
console.error('[Telegram Health Cron] Error fetching groups:', error);

// ✅ After:
const logger = createCronLogger('telegram-health-check');
logger.info('Health check started');
logger.info({ groupsCount: groups?.length || 0 }, 'Checking groups');
logger.error({ error }, 'Error fetching groups');
```

**Результат:**
```json
{
  "level": "info",
  "cron": "telegram-health-check",
  "groupsCount": 10,
  "msg": "Checking groups"
}
```

---

### **Priority 3: Check Webhook Cron** ✅
**Файл:** `app/api/cron/check-webhook/route.ts`

**Что заменили:**
```typescript
// ❌ Before:
console.log('[Webhook Cron] Checking webhook status...');
console.log('[Webhook Cron] ✅ Webhook restored successfully');

// ✅ After:
const logger = createCronLogger('check-webhook');
logger.info('Checking webhook status');
logger.info('Webhook restored successfully');
```

---

### **Priority 4: Weekly Digest Service** ✅
**Файл:** `lib/services/weeklyDigestService.ts`

**Что заменили:**
```typescript
// ❌ Before:
console.log(`[Digest] AI Insights generated: ${completion.usage?.total_tokens} tokens, $${totalCost.toFixed(4)}`);
console.error('[Digest] AI insights generation failed:', error);

// ✅ After:
const logger = createServiceLogger('WeeklyDigestService');
logger.info({ 
  tokens: completion.usage?.total_tokens, 
  costUsd: totalCost 
}, 'AI Insights generated');
logger.error({ error }, 'AI insights generation failed');
```

**Результат:**
```json
{
  "level": "info",
  "service": "WeeklyDigestService",
  "tokens": 1234,
  "costUsd": 0.0025,
  "msg": "AI Insights generated"
}
```

---

## 🎨 **4. Log Levels:**

**Использованные уровни:**

| Level | Когда использовать | Пример |
|-------|-------------------|--------|
| `error` | Ошибки, exceptions | `logger.error({ error }, 'Failed to fetch data')` |
| `warn` | Предупреждения, не критично | `logger.warn({ error }, 'Failed to fetch top contributors')` |
| `info` | Основные события | `logger.info('Webhook received')` |
| `debug` | Детальная информация (dev) | `logger.debug({ promptLength: 1234 }, 'Calling OpenAI')` |

**По умолчанию:**
- Production: `level: 'info'` (debug не показывается)
- Development: все уровни

**Настройка:** `LOG_LEVEL=debug` в `.env`

---

## ✅ **5. Преимущества:**

### **До (console.*):**
```
[Main Bot Webhook] ==================== WEBHOOK RECEIVED ====================
[Main Bot Webhook] Secret token check: { endpoint: '/api/telegram/webhook', ... }
```

**Проблемы:**
- ❌ Строки, сложно парсить
- ❌ Нет requestId
- ❌ Много шума

### **После (Pino):**
```json
{
  "level": "info",
  "time": "2025-11-07T20:46:51.865Z",
  "requestId": "iad1::abc123",
  "webhook": "main",
  "msg": "Webhook received"
}
```

**Преимущества:**
- ✅ JSON (легко парсить, query)
- ✅ requestId автоматически
- ✅ Structured context
- ✅ Performance (Pino ~10x faster than console.*)

---

## 📊 **6. Что дальше (Phase 2, Day 5-7):**

### **Error Dashboard UI** (Next step):
- Aggregation: Парсить JSON logs из Vercel
- Dashboard: `/superadmin/errors` page
- Filters: By service, error type, time range
- Alerts: Critical errors notification

### **Observability Stack (Future):**
- **Option A:** Vercel Observability (built-in, easiest)
- **Option B:** Axiom (free tier, 500GB)
- **Option C:** BetterStack (logs aggregation)

---

## 📋 **7. Файлы изменены:**

- ✅ `lib/logger.ts` — Logger utility (NEW)
- ✅ `app/api/telegram/webhook/route.ts` — Partial replacement (start of file)
- ✅ `app/api/cron/telegram-health-check/route.ts` — Full replacement
- ✅ `app/api/cron/check-webhook/route.ts` — Full replacement
- ✅ `lib/services/weeklyDigestService.ts` — Full replacement

---

## 🚀 **Deploy:**

```bash
git add lib/logger.ts app/api/telegram/webhook/route.ts app/api/cron/telegram-health-check/route.ts app/api/cron/check-webhook/route.ts lib/services/weeklyDigestService.ts docs/STRUCTURED_LOGGING_IMPLEMENTATION.md package.json package-lock.json
git commit -m "feat: Add structured logging with Pino (Phase 1)"
git push
```

---

## ✅ **Result:**

**Status:** ✅ COMPLETE  
**Time:** ~2 часа  
**Impact:** Better observability, production-ready logging  
**Next:** Day 5-7 - Error Dashboard UI in superadmin panel

