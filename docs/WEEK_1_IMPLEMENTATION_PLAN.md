# 📋 Week 1 Implementation Plan — Wave 0.1

**Duration:** Days 1-7 (Mon-Sun)  
**Goal:** Critical Stabilization — Webhook Health + Observability  
**Capacity:** 3-4 hours/day = ~24-28 hours total  
**Effort:** 11 story points

---

## 🎯 Success Criteria

After Week 1, you should have:
- ✅ Webhook idempotency working (no duplicate events)
- ✅ Errors logged to Supabase (visible in simple dashboard)
- ✅ Telegram health status visible in UI
- ✅ Admin actions tracked (audit log)
- ✅ Zero console.* logs (replaced with structured logging)

---

## 📅 Day-by-Day Plan

### Day 1 (Monday) — Database Setup ⚙️

**Time:** 3 hours  
**Points:** 2

#### Tasks:
1. ✅ **Review migrations 075-076** (created)
2. ✅ **Apply migration 074** (participant scoring — if not done yet)
3. ✅ **Apply migration 075** (idempotency table)
4. ✅ **Apply migration 076** (error logs + health tables)

#### Steps:
```bash
# 1. Open Supabase SQL Editor
# 2. Copy contents of db/migrations/074_implement_participant_scoring.sql
# 3. Execute (should see "Scoring System Verification" output)
# 4. Copy contents of db/migrations/075_restore_webhook_idempotency.sql
# 5. Execute (should see "Migration 075 Complete")
# 6. Copy contents of db/migrations/076_error_logs_and_health.sql
# 7. Execute (should see "Migration 076 Complete" with function list)
```

#### Verification:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'telegram_webhook_idempotency',
  'error_logs',
  'telegram_health_events',
  'admin_action_log'
);

-- Should return 4 rows

-- Test helper function
SELECT log_error(
  'info',
  'Test error log',
  'TEST_CODE',
  '{"test": true}'::jsonb
);

-- Should return an ID
```

#### Output:
- ✅ 4 new tables in database
- ✅ 7 new helper functions
- ✅ RLS policies active

---

### Day 2 (Tuesday) — Webhook Health Check 🏥

**Time:** 4 hours  
**Points:** 3

#### Task 1: Implement idempotency in webhook (2h)

**File:** `app/api/telegram/webhook/route.ts`

**Changes:**
1. Add idempotency check at start of handler
2. Insert record after successful processing
3. Add error logging for failures

**Code:**
```typescript
// At the top of POST handler, after secret validation:

// 1. Extract update_id
const updateId = body.update_id;
if (!updateId) {
  console.error('[Webhook] Missing update_id');
  return NextResponse.json({ ok: false }, { status: 400 });
}

// 2. Check if already processed
const { data: exists } = await supabase
  .from('telegram_webhook_idempotency')
  .select('update_id')
  .eq('update_id', updateId)
  .single();

if (exists) {
  // Already processed — return early (idempotent)
  return NextResponse.json({ ok: true });
}

// 3. Continue with processing...
// (existing code)

// 4. At the END, before return:
const chatId = getChatIdFromUpdate(body); // extract chat ID
const eventType = getEventTypeFromUpdate(body); // 'message', 'chat_member', etc.

await supabase
  .from('telegram_webhook_idempotency')
  .insert({
    update_id: updateId,
    tg_chat_id: chatId,
    event_type: eventType,
    org_id: orgId // if available
  });

// Log health success
await supabase.rpc('log_telegram_health', {
  p_tg_chat_id: chatId,
  p_event_type: 'webhook_success',
  p_status: 'healthy',
  p_org_id: orgId
});
```

#### Task 2: Create health check API endpoint (2h)

**New file:** `app/api/telegram/health/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';

export async function GET(req: NextRequest) {
  const supabase = createAdminServer();
  
  // Get all telegram groups
  const { data: groups, error } = await supabase
    .from('telegram_groups')
    .select('id, tg_chat_id, title, org_id, last_sync_at');
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Get health status for each group
  const healthStatuses = await Promise.all(
    groups.map(async (group) => {
      const { data: status } = await supabase.rpc('get_telegram_health_status', {
        p_tg_chat_id: group.tg_chat_id
      }).single();
      
      return {
        ...group,
        health: status
      };
    })
  );
  
  return NextResponse.json({
    ok: true,
    groups: healthStatuses,
    timestamp: new Date().toISOString()
  });
}
```

**New file:** `app/api/cron/telegram-health-check/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';

// This endpoint should be called every 10 minutes by Vercel Cron
// Add to vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/telegram-health-check",
//     "schedule": "*/10 * * * *"
//   }]
// }

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const supabase = createAdminServer();
  
  // Get all groups
  const { data: groups } = await supabase
    .from('telegram_groups')
    .select('tg_chat_id, title, org_id, last_sync_at');
  
  const results = [];
  
  for (const group of groups) {
    // Check if last_sync_at is stale (>15 minutes)
    const lastSync = new Date(group.last_sync_at);
    const now = new Date();
    const minutesSinceSync = (now.getTime() - lastSync.getTime()) / 60000;
    
    if (minutesSinceSync > 15) {
      // Log health warning
      await supabase.rpc('log_telegram_health', {
        p_tg_chat_id: group.tg_chat_id,
        p_event_type: 'webhook_failure',
        p_status: 'degraded',
        p_message: `No activity for ${Math.round(minutesSinceSync)} minutes`,
        p_org_id: group.org_id
      });
      
      results.push({
        chat_id: group.tg_chat_id,
        status: 'degraded',
        minutes_since_sync: minutesSinceSync
      });
    } else {
      results.push({
        chat_id: group.tg_chat_id,
        status: 'healthy',
        minutes_since_sync: minutesSinceSync
      });
    }
  }
  
  return NextResponse.json({
    ok: true,
    checked: groups.length,
    results
  });
}
```

#### Verification:
```bash
# Test health endpoint
curl http://localhost:3000/api/telegram/health

# Test cron endpoint (locally)
curl -H "Authorization: Bearer test-secret" \
  http://localhost:3000/api/cron/telegram-health-check
```

---

### Day 3 (Wednesday) — Structured Logging 📝

**Time:** 3 hours  
**Points:** 2

#### Task 1: Install and configure Pino (1h)

```bash
cd /path/to/orbo-1.1
npm install pino pino-pretty
```

**New file:** `lib/logger.ts`

```typescript
import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  }),
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.api_key'
    ],
    censor: '[REDACTED]'
  }
});

// Helper to create child logger with context
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

// Helper to log to Supabase error_logs
export async function logErrorToDb(
  supabase: any,
  error: Error | string,
  context: {
    code?: string;
    org_id?: string;
    user_id?: string;
    metadata?: Record<string, any>;
  }
) {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;
  
  await supabase.rpc('log_error', {
    p_level: 'error',
    p_message: message,
    p_error_code: context.code,
    p_context: context.metadata ? JSON.stringify(context.metadata) : null,
    p_stack_trace: stack,
    p_org_id: context.org_id,
    p_user_id: context.user_id
  });
}
```

#### Task 2: Replace console.* in webhook (2h)

**File:** `app/api/telegram/webhook/route.ts`

```typescript
import { logger, logErrorToDb } from '@/lib/logger';

// At the top, create context logger
const webhookLogger = logger.child({ component: 'telegram-webhook' });

// Replace all console.log → webhookLogger.info
// Replace all console.error → webhookLogger.error
// Replace all console.warn → webhookLogger.warn

// Example:
webhookLogger.info({ 
  update_id: body.update_id, 
  chat_id: chatId 
}, 'Processing telegram update');

// On errors:
try {
  // ... processing
} catch (error) {
  webhookLogger.error({ 
    error, 
    update_id: body.update_id, 
    chat_id: chatId 
  }, 'Failed to process webhook');
  
  // Also log to database
  await logErrorToDb(supabase, error as Error, {
    code: 'WEBHOOK_PROCESSING_ERROR',
    org_id: orgId,
    metadata: { update_id: body.update_id, chat_id: chatId }
  });
}
```

#### Verification:
```bash
# Start dev server
npm run dev

# Send test webhook
# Logs should be prettier and structured
```

---

### Day 4 (Thursday) — Error Dashboard UI 📊

**Time:** 4 hours  
**Points:** 2

#### Task: Create simple error dashboard page

**New file:** `app/app/[org]/system/errors/page.tsx`

```typescript
import { requireOrgAccess } from '@/lib/orgGuard';
import AppShell from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClientServer } from '@/lib/supabaseClient';

export default async function ErrorsPage({ params: { org } }: { params: { org: string }}) {
  const { supabase } = await requireOrgAccess(org);
  
  // Get recent errors
  const { data: errors } = await supabase
    .from('error_logs')
    .select('*')
    .eq('org_id', org)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  
  // Group by fingerprint
  const grouped = errors?.reduce((acc, error) => {
    const key = error.fingerprint || error.id;
    if (!acc[key]) {
      acc[key] = { ...error, count: 0, last_seen: error.created_at };
    }
    acc[key].count++;
    if (error.created_at > acc[key].last_seen) {
      acc[key].last_seen = error.created_at;
    }
    return acc;
  }, {} as Record<string, any>);
  
  const uniqueErrors = Object.values(grouped || {});
  
  return (
    <AppShell orgId={org}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">System Errors</h1>
          <div className="text-sm text-neutral-500">
            {uniqueErrors.length} unique errors
          </div>
        </div>
        
        {uniqueErrors.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-neutral-500">
              No errors logged 🎉
            </CardContent>
          </Card>
        )}
        
        {uniqueErrors.map((error: any) => (
          <Card key={error.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {error.error_code || 'Unknown Error'}
                </CardTitle>
                <span className={`
                  px-2 py-1 rounded text-xs font-medium
                  ${error.level === 'error' ? 'bg-red-100 text-red-800' : ''}
                  ${error.level === 'warn' ? 'bg-yellow-100 text-yellow-800' : ''}
                  ${error.level === 'info' ? 'bg-blue-100 text-blue-800' : ''}
                `}>
                  {error.level}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-700 mb-2">{error.message}</p>
              {error.count > 1 && (
                <p className="text-xs text-neutral-500">
                  Occurred {error.count} times, last seen {new Date(error.last_seen).toLocaleString()}
                </p>
              )}
              {error.context && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-neutral-500">Context</summary>
                  <pre className="mt-2 p-2 bg-neutral-50 rounded overflow-x-auto">
                    {JSON.stringify(error.context, null, 2)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
```

**Update navigation** in `components/app-shell.tsx`:

```typescript
const nav = [
  { href: `/app/${orgId}/dashboard`, label: 'Дашборд' },
  { href: `/app/${orgId}/telegram`, label: 'Telegram' },
  { href: `/app/${orgId}/members`, label: 'Участники' },
  { href: `/app/${orgId}/materials`, label: 'Материалы' },
  { href: `/app/${orgId}/events`, label: 'События' },
  { href: `/app/${orgId}/system/errors`, label: '⚠️ Errors' }, // NEW
]
```

---

### Day 5 (Friday) — Health Widget UI 🏥

**Time:** 3 hours  
**Points:** 2

#### Task: Add health status widget to Telegram settings

**File:** `app/app/[org]/telegram/page.tsx`

Add health status section:

```typescript
// After existing Telegram connection UI

// Fetch health data
const { data: groups } = await supabase
  .from('telegram_groups')
  .select('id, tg_chat_id, title, last_sync_at')
  .eq('org_id', org);

const healthStatuses = await Promise.all(
  (groups || []).map(async (group) => {
    const { data: status } = await supabase
      .rpc('get_telegram_health_status', {
        p_tg_chat_id: group.tg_chat_id
      })
      .single();
    
    return {
      ...group,
      health: status
    };
  })
);

// In JSX:
<Card className="mt-4">
  <CardHeader>
    <CardTitle>Group Health Status</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-3">
      {healthStatuses.map((group) => (
        <div key={group.id} className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <div className="font-medium">{group.title}</div>
            <div className="text-xs text-neutral-500">
              Last sync: {group.last_sync_at ? new Date(group.last_sync_at).toLocaleString() : 'Never'}
            </div>
          </div>
          <div className={`
            px-3 py-1 rounded-full text-sm font-medium
            ${group.health?.status === 'healthy' ? 'bg-green-100 text-green-800' : ''}
            ${group.health?.status === 'unhealthy' ? 'bg-red-100 text-red-800' : ''}
          `}>
            {group.health?.status || 'unknown'}
          </div>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

---

### Day 6 (Saturday) — Admin Action Logging 📋

**Time:** 3 hours  
**Points:** 1

#### Task: Add audit logging to key admin actions

**Files to update:**
1. `app/api/participants/[participantId]/route.ts` (update participant)
2. `app/api/events/[eventId]/route.ts` (update/delete event)
3. `app/api/telegram/groups/sync/route.ts` (sync groups)

**Example for participant update:**

```typescript
// In PUT handler, after successful update:

await supabase.rpc('log_admin_action', {
  p_org_id: orgId,
  p_user_id: userId,
  p_action: 'update_participant',
  p_resource_type: 'participant',
  p_resource_id: participantId,
  p_changes: {
    before: oldData,
    after: newData
  }
});
```

---

### Day 7 (Sunday) — Testing & Verification ✅

**Time:** 3 hours  
**Points:** 1

#### Tasks:
1. **End-to-end testing** (2h)
   - Send test webhook → verify idempotency
   - Trigger error → check error dashboard
   - Sync group → check health status
   - Update participant → check audit log

2. **Documentation update** (1h)
   - Update `docs/WEEK_1_IMPLEMENTATION_PLAN.md` with actual results
   - Create `docs/OBSERVABILITY_GUIDE.md` (how to use error dashboard)

#### Verification Checklist:

```
□ Migration 075 applied (idempotency table exists)
□ Migration 076 applied (error_logs, health_events, admin_action_log exist)
□ Webhook processes update exactly once (test with duplicate)
□ Errors visible in /app/[org]/system/errors
□ Health status shows in /app/[org]/telegram
□ Admin actions logged (check admin_action_log table)
□ Structured logs in console (Pino format)
□ Zero console.log/error in webhook handler
□ Cron endpoint added to vercel.json
□ All tests passing
```

---

## 📊 Progress Tracking

Update daily:

```
Day 1: □ Database Setup (2 points)
Day 2: □ Webhook Health Check (3 points)
Day 3: □ Structured Logging (2 points)
Day 4: □ Error Dashboard UI (2 points)
Day 5: □ Health Widget UI (2 points)
Day 6: □ Admin Action Logging (1 point)
Day 7: □ Testing & Verification (1 point)

Total: 13 points (target: 11 points)
```

---

## 🚨 Blockers & Mitigation

| Blocker | Mitigation |
|---------|------------|
| Migration fails | Check Supabase logs, test in local Postgres first |
| Pino performance issues | Add sampling (only log 10% in production) |
| UI rendering slow | Paginate error logs (show 50 max) |
| Idempotency collisions | Check update_id extraction logic |

---

## 📞 Check-in Points

- **Day 3 (Wed):** Review structured logging implementation
- **Day 5 (Fri):** Review UI components
- **Day 7 (Sun):** Week retrospective, plan Week 2

---

## 🎉 Week 1 Success Celebration

When all checklist items complete:
- Post to social media (if comfortable) about building in public
- Share screenshot of error dashboard with "Zero errors" 🎉
- Prep for Week 2 (Analytics Wow-Effect)

---

**Ready to start Day 1?** Let me know when migrations are applied! 🚀

