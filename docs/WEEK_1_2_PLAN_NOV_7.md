# План Week 1-2: Вариант D (Гибрид) — 7-21 ноября 2025

## 🎯 Цель: Stabilization + Revenue Enablement

---

## 📅 **Week 1 (Days 1-7): Block 0.1 — Critical Stabilization**

### **Day 1-2: Fix Telegram Health Monitoring** 🔴 CRITICAL

**Проблема:** Виджет `TelegramHealthStatus` неработоспособен (по словам пользователя)

#### **Задачи:**

**Day 1 Morning: Debug**
- [ ] **Проверить Vercel logs:**
  - Открыть Vercel dashboard → Logs
  - Найти запросы к `/api/telegram/health`
  - Посмотреть на ошибки (500/404/timeout)
- [ ] **Проверить Supabase data:**
  - Запустить SQL: `SELECT COUNT(*) FROM telegram_health_events;`
  - Если 0 → Cron job не пишет события
  - Запустить SQL: `SELECT * FROM telegram_health_events ORDER BY created_at DESC LIMIT 10;`
  - Проверить, что события пишутся
- [ ] **Проверить Frontend:**
  - Открыть `/superadmin/telegram` в браузере
  - DevTools → Network tab → найти запрос к `/api/telegram/health`
  - Посмотреть на response (200 OK? пустой JSON?)
  - Console → проверить ошибки JavaScript

**Day 1 Afternoon: Identify Root Cause**
- [ ] **Если нет событий в БД:**
  - Причина: Cron job пишет только degraded/unhealthy события
  - Все группы healthy → ничего не пишется → RPC возвращает NULL
  - **Fix:** Изменить cron job писать **все** события (включая healthy)
- [ ] **Если RLS блокирует:**
  - Причина: Суперадмин не имеет доступа к `telegram_health_events`
  - **Fix:** Добавить политику для суперадминов
- [ ] **Если Frontend ошибка:**
  - Причина: Не обрабатывает null/undefined
  - **Fix:** Добавить fallback UI для пустых данных

**Day 2: Implement Fix**
- [ ] **Option A: Изменить cron job** (если нет событий)
  ```typescript
  // В /api/cron/telegram-health-check/route.ts
  // БЫЛО: if (status !== 'healthy') { log_telegram_health(...) }
  // СТАЛО: ВСЕГДА log_telegram_health(...)
  ```
- [ ] **Option B: Добавить RLS политику** (если RLS блокирует)
  ```sql
  -- Superadmins can see all health events
  CREATE POLICY telegram_health_superadmin ON public.telegram_health_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid())
  );
  ```
- [ ] **Option C: Улучшить Frontend** (если ошибка обработки)
  ```typescript
  // В TelegramHealthStatus component
  // Добавить fallback для пустых данных
  if (!health || !health.summary) {
    return <Card>No data available</Card>;
  }
  ```
- [ ] **Test:** Виджет должен показывать данные
- [ ] **Deploy:** git commit + push

**Time:** 2 дня (16 часов)  
**Deliverable:** ✅ Работающий health monitoring widget

---

### **Day 3-4: Structured Logging (Pino)** 🟡

**Цель:** Заменить `console.log/error` на structured logging для better observability

#### **Задачи:**

**Day 3 Morning: Setup Pino**
- [ ] **Install dependencies:**
  ```bash
  npm install pino pino-pretty
  ```
- [ ] **Create `lib/logger.ts`:**
  ```typescript
  import pino from 'pino';

  export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    browser: { asObject: true }, // For Next.js client-side
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({ 
        pid: bindings.pid, 
        hostname: bindings.hostname 
      })
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });

  // Helper for API routes
  export function createLoggerContext(req: Request) {
    return logger.child({
      requestId: req.headers.get('x-vercel-id') || 'unknown',
      url: req.url,
      method: req.method
    });
  }
  ```

**Day 3 Afternoon: Replace console.* in API routes**
- [ ] **Find & replace in `app/api/`:**
  ```typescript
  // БЫЛО:
  console.log('[Webhook] Processing message:', message);
  console.error('[Webhook] Error:', error);

  // СТАЛО:
  import { createLoggerContext } from '@/lib/logger';
  const logger = createLoggerContext(request);
  logger.info({ message }, 'Processing message');
  logger.error({ error }, 'Processing failed');
  ```
- [ ] **Priority files:**
  - `app/api/telegram/webhook/route.ts`
  - `app/api/cron/telegram-health-check/route.ts`
  - `app/api/cron/check-webhook/route.ts`
  - `app/api/telegram/health/route.ts`

**Day 4: Replace console.* in services**
- [ ] **Find & replace in `lib/services/`:**
  ```typescript
  import { logger } from '@/lib/logger';
  logger.info({ orgId, userId }, 'Enriching participant');
  logger.error({ error }, 'Enrichment failed');
  ```
- [ ] **Priority files:**
  - `lib/services/participantEnrichmentService.ts`
  - `lib/services/weeklyDigestService.ts`
  - `lib/services/eventProcessingService.ts`

**Day 4 Evening: Test & Deploy**
- [ ] **Test locally:** `npm run dev` → проверить логи в консоли (JSON format)
- [ ] **Deploy:** git commit + push
- [ ] **Verify in Vercel:** Logs должны быть в structured JSON format

**Time:** 2 дня (16 часов)  
**Deliverable:** ✅ Structured logging во всех critical paths

---

### **Day 5-7: Error Dashboard UI** 🟡

**Цель:** Создать UI для просмотра ошибок из `error_logs` в суперадминке

#### **Задачи:**

**Day 5: API Endpoint**
- [ ] **Create `/api/superadmin/errors/route.ts`:**
  ```typescript
  // GET: Fetch errors with filters
  export async function GET(request: NextRequest) {
    await requireSuperadmin();
    
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level'); // error, warn, info
    const orgId = searchParams.get('orgId');
    const resolved = searchParams.get('resolved') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    let query = supabase
      .from('error_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (level) query = query.eq('level', level);
    if (orgId) query = query.eq('org_id', orgId);
    if (resolved) query = query.not('resolved_at', 'is', null);
    else query = query.is('resolved_at', null); // Only unresolved by default
    
    const { data, error, count } = await query;
    
    return NextResponse.json({ 
      errors: data, 
      total: count,
      offset,
      limit
    });
  }

  // PATCH: Mark error as resolved
  export async function PATCH(request: NextRequest) {
    await requireSuperadmin();
    
    const { errorId } = await request.json();
    
    const { error } = await supabase
      .from('error_logs')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', errorId);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  }
  ```

**Day 6: UI Component**
- [ ] **Create `app/superadmin/errors/page.tsx`:**
  ```typescript
  'use client';

  import { useEffect, useState } from 'react';
  import { Card } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';

  interface ErrorLog {
    id: number;
    level: string;
    message: string;
    error_code: string | null;
    created_at: string;
    resolved_at: string | null;
    org_id: string | null;
    fingerprint: string;
  }

  export default function ErrorsPage() {
    const [errors, setErrors] = useState<ErrorLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ level: 'all', resolved: false });

    useEffect(() => {
      fetchErrors();
    }, [filter]);

    const fetchErrors = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter.level !== 'all') params.set('level', filter.level);
      if (filter.resolved) params.set('resolved', 'true');
      
      const res = await fetch(`/api/superadmin/errors?${params}`);
      const data = await res.json();
      setErrors(data.errors);
      setLoading(false);
    };

    const markResolved = async (errorId: number) => {
      await fetch('/api/superadmin/errors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorId })
      });
      fetchErrors();
    };

    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Error Logs</h1>
        
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <select 
            value={filter.level} 
            onChange={(e) => setFilter({ ...filter, level: e.target.value })}
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
          </select>
          
          <label>
            <input 
              type="checkbox" 
              checked={filter.resolved}
              onChange={(e) => setFilter({ ...filter, resolved: e.target.checked })}
            />
            Show resolved
          </label>
        </div>

        {/* Table */}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-2">
            {errors.map(error => (
              <Card key={error.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={
                        error.level === 'error' ? 'destructive' : 
                        error.level === 'warn' ? 'warning' : 
                        'default'
                      }>
                        {error.level.toUpperCase()}
                      </Badge>
                      {error.error_code && (
                        <span className="text-sm text-gray-600">{error.error_code}</span>
                      )}
                      <span className="text-sm text-gray-500">
                        {new Date(error.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{error.message}</p>
                  </div>
                  
                  {!error.resolved_at && (
                    <Button size="sm" onClick={() => markResolved(error.id)}>
                      Mark Resolved
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

**Day 7: Integration & Testing**
- [ ] **Add link to sidebar:** `app/superadmin/layout.tsx`
  ```typescript
  { href: '/superadmin/errors', label: 'Ошибки', icon: AlertCircle }
  ```
- [ ] **Test:**
  - Открыть `/superadmin/errors`
  - Проверить фильтры (level, resolved)
  - Нажать "Mark Resolved" → error должен исчезнуть из списка
  - Проверить pagination (если >50 errors)
- [ ] **Deploy:** git commit + push

**Time:** 3 дня (24 часа)  
**Deliverable:** ✅ Error dashboard UI с фильтрами и возможностью mark as resolved

---

## 📅 **Week 2 (Days 8-14): Manual Payment Tracking**

### **Day 8-10: Payment Schema + API**

**Цель:** Создать базовую систему для manual payment tracking

#### **Day 8: Database Schema**

- [ ] **Create Migration `101_payment_tracking.sql`:**
  ```sql
  -- Subscription plans (для org)
  CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    
    -- Plan details
    plan_name TEXT NOT NULL, -- 'monthly', 'annual', 'custom'
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    billing_period TEXT NOT NULL, -- 'monthly', 'annual', 'one-time'
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE, -- NULL for one-time payments
    next_billing_date DATE,
    
    -- Metadata
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Payments (связаны с subscriptions)
  CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    payment_method TEXT NOT NULL, -- 'bank_transfer', 'card', 'cash', 'other'
    payment_method_details TEXT, -- 'Карта 1234', 'Реквизиты: ИНН 123...'
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    
    -- Dates
    due_date DATE,
    paid_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    receipt_url TEXT, -- Link to receipt/invoice
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Payment methods (для org)
  CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Method details
    method_type TEXT NOT NULL, -- 'bank_transfer', 'card', 'cash', 'other'
    display_name TEXT NOT NULL, -- 'Перевод на карту Сбербанк'
    instructions TEXT, -- 'Карта: 1234 5678 9012 3456, Получатель: Иванов И.И.'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Indexes
  CREATE INDEX idx_subscriptions_org ON subscriptions(org_id);
  CREATE INDEX idx_subscriptions_participant ON subscriptions(participant_id);
  CREATE INDEX idx_subscriptions_status ON subscriptions(status);
  CREATE INDEX idx_payments_subscription ON payments(subscription_id);
  CREATE INDEX idx_payments_org ON payments(org_id);
  CREATE INDEX idx_payments_status ON payments(status);

  -- RLS
  ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

  -- Org members can see their subscriptions/payments
  CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE org_id = subscriptions.org_id AND user_id = auth.uid())
  );

  CREATE POLICY payments_select ON payments FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE org_id = payments.org_id AND user_id = auth.uid())
  );

  CREATE POLICY payment_methods_select ON payment_methods FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE org_id = payment_methods.org_id AND user_id = auth.uid())
  );

  -- Only owners/admins can INSERT/UPDATE
  CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE org_id = subscriptions.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

  CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM memberships WHERE org_id = subscriptions.org_id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

  -- Same for payments and payment_methods...
  ```

- [ ] **Apply migration:** `npx supabase db push --db-url "$env:DATABASE_URL"`

#### **Day 9-10: API Endpoints**

- [ ] **Create `/api/subscriptions/route.ts`:**
  - GET: Fetch subscriptions for org
  - POST: Create new subscription
  - PATCH: Update subscription (status, dates)
  - DELETE: Delete subscription
- [ ] **Create `/api/payments/route.ts`:**
  - GET: Fetch payments for subscription
  - POST: Create new payment
  - PATCH: Mark payment as confirmed/failed
- [ ] **Create `/api/payment-methods/route.ts`:**
  - GET: Fetch payment methods for org
  - POST: Create new payment method
  - PATCH: Update payment method
  - DELETE: Delete payment method

**Time:** 3 дня (24 часа)  
**Deliverable:** ✅ Payment schema + CRUD APIs

---

### **Day 11-14: Payment UI**

**Цель:** Создать UI для manual payment tracking в админке организации

#### **Day 11-12: Subscriptions UI**

- [ ] **Create `/app/app/[org]/subscriptions/page.tsx`:**
  - Table: participant, plan, amount, status, start_date, end_date, actions
  - Button: "Create Subscription"
  - Actions: Edit, Cancel, View Payments
- [ ] **Create modal/dialog for creating subscription:**
  - Form: participant_id, plan_name, amount, billing_period, start_date, notes
  - Validation: required fields
  - Submit: POST to `/api/subscriptions`

#### **Day 13-14: Payments UI**

- [ ] **Create `/app/app/[org]/subscriptions/[id]/payments/page.tsx`:**
  - Table: amount, due_date, paid_at, status, payment_method, actions
  - Button: "Record Payment"
  - Actions: Mark as Confirmed, View Receipt
- [ ] **Create modal/dialog for recording payment:**
  - Form: amount, payment_method, payment_method_details, due_date, notes
  - Button: "Mark as Confirmed"
  - Submit: POST to `/api/payments`

#### **Day 14: Integration & Testing**

- [ ] **Add link to sidebar:** "Subscriptions" (link to `/app/[org]/subscriptions`)
- [ ] **Test:**
  - Create subscription → payment появился в таблице
  - Record payment → статус изменился на "confirmed"
  - Cancel subscription → статус изменился на "cancelled"
- [ ] **Deploy:** git commit + push

**Time:** 4 дня (32 часа)  
**Deliverable:** ✅ Manual payment tracking UI

---

## 📊 Week 1-2 Summary:

| Week | Focus | Time | Deliverables |
|------|-------|------|--------------|
| **Week 1** | Block 0.1 (Stabilization) | 7 days | ✅ Health monitoring fix, Structured logging, Error dashboard |
| **Week 2** | Manual Payments | 7 days | ✅ Payment schema, CRUD APIs, Payment UI |

**Total:** 14 days (112 hours)

---

## 🔜 После Week 1-2: Week 3-4 (Marketplace Planning + Implementation)

**ВАЖНО:** Перед началом Week 3 нужно **подробно обсудить marketplace** с точки зрения продукта и бизнеса!

**Вопросы для обсуждения:**
1. **Бизнес-модель:** Как маркетплейс будет приносить деньги? (комиссия, подписка, revenue share?)
2. **Целевая аудитория:** Кто будет создавать модули? (разработчики, no-code users, внутренние модули?)
3. **MVP scope:** Какие модули критичны для первого запуска? (Daily Digest, Conflict Signals, ...)
4. **Архитектура:** Internal modules vs External API? (безопасность, sandbox, approval process?)
5. **UX:** Как пользователи будут находить/устанавливать модули? (marketplace UI, app store feel?)

**Следующий шаг:** После завершения Week 2 (или даже параллельно Week 2) - **детальное обсуждение marketplace** с вами! 🎯

---

**Готовы начинать Week 1?** 🚀

