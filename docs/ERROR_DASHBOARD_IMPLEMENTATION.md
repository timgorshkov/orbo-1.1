# Error Dashboard Implementation ✅

**Date:** 7 ноября 2025  
**Status:** COMPLETE  
**Time:** ~2 часа

---

## 🎯 **Цель:**

Создать Error Dashboard в superadmin панели для:
- ✅ Мониторинга критических ошибок
- ✅ Фильтрации по уровню (error/warn/info)
- ✅ Фильтрации по времени (1 час - 1 неделя)
- ✅ Просмотра деталей (stack trace, context)
- ✅ Разрешения ошибок (mark as resolved)

---

## 📊 **Архитектура:**

### **1. База данных: `error_logs` table** ✅
**Уже существует** (migration 076)

**Структура:**
```sql
CREATE TABLE error_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Context
  org_id UUID,
  user_id UUID,
  
  -- Error details
  level TEXT ('error', 'warn', 'info'),
  message TEXT,
  error_code TEXT, -- e.g., 'WEBHOOK_FAILURE'
  
  -- Metadata
  context JSONB, -- { service: '...', webhook: '...', ... }
  stack_trace TEXT,
  
  -- Deduplication
  fingerprint TEXT, -- hash(error_code + message + context)
  
  -- Timestamps
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ, -- mark as resolved
  
  -- Request context
  request_id TEXT,
  user_agent TEXT
);
```

**Indexes:**
- `idx_error_logs_created` (created_at DESC)
- `idx_error_logs_org` (org_id, created_at DESC)
- `idx_error_logs_level` (level, created_at DESC)
- `idx_error_logs_fingerprint` (fingerprint, created_at DESC)

---

### **2. API Endpoint: `/api/superadmin/errors`** ✅
**Файл:** `app/api/superadmin/errors/route.ts`

#### **GET - Fetch errors**
**Query params:**
- `level` (optional): 'error' | 'warn' | 'info'
- `hours` (default: 24): time range
- `limit` (default: 100): max results
- `error_code` (optional): filter by error code

**Response:**
```json
{
  "ok": true,
  "errors": [
    {
      "id": 123,
      "level": "error",
      "message": "Failed to process webhook",
      "error_code": "WEBHOOK_FAILURE",
      "context": { "webhook": "main", "tg_chat_id": -123456 },
      "stack_trace": "Error: ...",
      "created_at": "2025-11-07T20:00:00Z",
      "request_id": "iad1::abc123"
    }
  ],
  "statistics": {
    "total": 150,
    "error": 50,
    "warn": 80,
    "info": 20
  },
  "filters": {
    "level": null,
    "hours": 24,
    "limit": 100,
    "error_code": null
  }
}
```

#### **PATCH - Mark error as resolved**
**Body:**
```json
{
  "id": 123,
  "resolved": true
}
```

**Response:**
```json
{
  "ok": true
}
```

---

### **3. UI Component: `ErrorDashboard`** ✅
**Файл:** `components/superadmin/error-dashboard.tsx`

**Features:**
- ✅ Statistics cards (total, errors, warnings, info)
- ✅ Level filter (all, error, warn, info)
- ✅ Time filter (1h, 6h, 24h, 3d, 1w)
- ✅ Auto-refresh every 30 seconds
- ✅ Expandable error details (stack trace, context)
- ✅ Mark as resolved button
- ✅ Resolved errors shown with reduced opacity

**UI Example:**
```
┌─────────────────────────────────────────────────────────┐
│ Statistics                                               │
│ ┌─────┐ ┌───────┐ ┌──────────┐ ┌──────┐                │
│ │Total│ │Errors │ │Warnings  │ │Info  │                │
│ │ 150 │ │  50   │ │   80     │ │  20  │                │
│ └─────┘ └───────┘ └──────────┘ └──────┘                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Filters                            [Refresh] (loading)  │
│ Level: [All v]  Time Range: [Last 24 hours v]          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Error Logs (50)                                          │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ [!] ERROR  WEBHOOK_FAILURE  07.11.2025 20:00    │    │
│ │ Failed to process webhook                        │    │
│ │ Service: TelegramWebhook                         │    │
│ │                                [Resolve] [v]     │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ [⚠] WARN   07.11.2025 19:45                      │    │
│ │ Failed to fetch top contributors  [RESOLVED]     │    │
│ │ Service: WeeklyDigestService                     │    │
│ │                                        [^]       │    │
│ └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Expanded error details:**
```
┌─────────────────────────────────────────────────────┐
│ [!] ERROR  WEBHOOK_FAILURE  07.11.2025 20:00        │
│ Failed to process webhook                            │
│ Service: TelegramWebhook                             │
│                                [Resolve] [^]         │
│ ─────────────────────────────────────────────────── │
│ Request ID:                                          │
│ iad1::abc123                                         │
│                                                      │
│ Context:                                             │
│ {                                                    │
│   "webhook": "main",                                 │
│   "tg_chat_id": -123456,                             │
│   "requestId": "iad1::abc123"                        │
│ }                                                    │
│                                                      │
│ Stack Trace:                                         │
│ Error: Failed to process webhook                     │
│   at processWebhook (webhook/route.ts:123:15)       │
│   at POST (webhook/route.ts:78:20)                   │
│   ...                                                │
└─────────────────────────────────────────────────────┘
```

---

### **4. Superadmin Page: `/superadmin/errors`** ✅
**Файл:** `app/superadmin/errors/page.tsx`

**Navigation:** Added to superadmin layout with AlertCircle icon

---

### **5. Utility: `logErrorToDatabase()`** ✅
**Файл:** `lib/logErrorToDatabase.ts`

**Usage:**
```typescript
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

// Simple usage
await logErrorToDatabase({
  level: 'error',
  message: 'Failed to process webhook',
  errorCode: 'WEBHOOK_FAILURE',
  context: { webhook: 'main', tg_chat_id: -123456 },
  stackTrace: error.stack,
  requestId: 'abc123'
});

// With logger integration
import { createAPILogger } from '@/lib/logger';
import { logErrorFromLogger } from '@/lib/logErrorToDatabase';

const logger = createAPILogger(req, { webhook: 'main' });

try {
  // ... some code
} catch (error) {
  logger.error({ error }, 'Webhook processing failed');
  
  // Also log to database
  await logErrorFromLogger(logger, error, {
    errorCode: 'WEBHOOK_FAILURE',
    message: 'Webhook processing failed'
  });
  
  throw error;
}
```

**Features:**
- ✅ Automatic fingerprint generation (for deduplication)
- ✅ Context extraction from logger bindings
- ✅ Silent fail (doesn't throw errors from error logging)
- ✅ Automatic orgId/userId/requestId extraction

**Fingerprint calculation:**
```typescript
const fingerprint = hash(
  error_code + 
  message + 
  (service || webhook || cron || endpoint)
)
```

This helps deduplicate repeated errors with the same root cause.

---

## 🎨 **Пример интеграции:**

### **Example 1: API Route**
```typescript
import { createAPILogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'digest/test-send' });
  
  try {
    // ... code
    logger.info('Digest sent successfully');
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Failed to send digest');
    
    // Log critical error to database
    await logErrorToDatabase({
      level: 'error',
      message: error instanceof Error ? error.message : 'Failed to send digest',
      errorCode: 'DIGEST_SEND_FAILURE',
      context: {
        endpoint: 'digest/test-send',
        orgId: orgId
      },
      stackTrace: error instanceof Error ? error.stack : undefined,
      requestId: req.headers.get('x-vercel-id') || undefined,
      orgId: orgId
    });
    
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 });
  }
}
```

### **Example 2: Service**
```typescript
import { createServiceLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

const logger = createServiceLogger('WeeklyDigestService');

export async function generateWeeklyDigest(orgId: string) {
  try {
    // ... code
    logger.info('Digest generated successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to generate digest');
    
    // Log to database
    await logErrorToDatabase({
      level: 'error',
      message: 'AI insights generation failed',
      errorCode: 'AI_INSIGHTS_FAILURE',
      context: {
        service: 'WeeklyDigestService',
        orgId: orgId
      },
      stackTrace: error instanceof Error ? error.stack : undefined,
      orgId: orgId
    });
    
    throw error;
  }
}
```

### **Example 3: Cron Job**
```typescript
import { createCronLogger } from '@/lib/logger';
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

export async function GET(req: NextRequest) {
  const logger = createCronLogger('telegram-health-check');
  
  try {
    // ... code
    logger.info('Health check complete');
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    
    // Log to database
    await logErrorToDatabase({
      level: 'error',
      message: 'Telegram health check failed',
      errorCode: 'HEALTH_CHECK_FAILURE',
      context: {
        cron: 'telegram-health-check'
      },
      stackTrace: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 });
  }
}
```

---

## ✅ **Преимущества:**

### **Before (no dashboard):**
- ❌ Errors only in Vercel logs (hard to search)
- ❌ No aggregation or statistics
- ❌ No filtering
- ❌ No resolution tracking

### **After (Error Dashboard):**
- ✅ Centralized error tracking
- ✅ Statistics (total, by level)
- ✅ Filters (level, time range)
- ✅ Full context (stack trace, request ID)
- ✅ Mark as resolved
- ✅ Deduplication via fingerprint
- ✅ Auto-refresh (30 sec)

---

## 📋 **Файлы созданы:**

- ✅ `app/api/superadmin/errors/route.ts` — API endpoint
- ✅ `components/superadmin/error-dashboard.tsx` — UI component
- ✅ `app/superadmin/errors/page.tsx` — Superadmin page
- ✅ `app/superadmin/layout.tsx` — Updated navigation
- ✅ `lib/logErrorToDatabase.ts` — Utility for logging to DB
- ✅ `docs/ERROR_DASHBOARD_IMPLEMENTATION.md` — This doc

---

## 🚀 **Deploy:**

```bash
git add app/api/superadmin/errors/route.ts components/superadmin/error-dashboard.tsx app/superadmin/errors/page.tsx app/superadmin/layout.tsx lib/logErrorToDatabase.ts docs/ERROR_DASHBOARD_IMPLEMENTATION.md

git commit -m "feat: Add Error Dashboard to superadmin panel

- API endpoint for fetching/resolving errors
- UI component with filters and statistics
- Utility for logging errors to database
- Auto-refresh every 30 seconds"

git push
```

---

## 🧪 **Testing:**

### **1. Навигация:**
- Открыть: `https://app.orbo.ru/superadmin/errors`
- Проверить: есть ли вкладка "Errors" в navigation

### **2. Empty state:**
Если ошибок нет, должно показываться:
```
✓ No errors in the selected time range
```

### **3. Manual test:**
Чтобы создать тестовую ошибку:
```typescript
// В любом API route:
import { logErrorToDatabase } from '@/lib/logErrorToDatabase';

await logErrorToDatabase({
  level: 'error',
  message: 'Test error for dashboard',
  errorCode: 'TEST_ERROR',
  context: { test: true }
});
```

Затем обновить `/superadmin/errors` — должна появиться ошибка.

### **4. Filters:**
- Переключить Level: All → Error (должны остаться только errors)
- Переключить Time Range: Last 24 hours → Last hour
- Нажать Refresh — должны обновиться данные

### **5. Expand/Resolve:**
- Нажать на стрелку → должны раскрыться детали (context, stack trace)
- Нажать "Resolve" → ошибка должна стать серой (resolved)

---

## 🔜 **Next Steps (Optional):**

### **Phase 3: Advanced features** (Future):
- Real-time updates (websockets/polling)
- Error grouping by fingerprint
- Email/Telegram alerts for critical errors
- Error rate charts (Chart.js)
- Integration with external services (Sentry, BetterStack)

### **Integration examples to add:**
- Webhook processing errors
- AI enrichment failures
- Import JSON errors
- Payment processing errors

---

## ✅ **Result:**

**Status:** ✅ COMPLETE  
**Time:** ~2 часа  
**Impact:** Centralized error tracking and monitoring in superadmin panel  
**Next:** Integrate `logErrorToDatabase()` in critical error paths

