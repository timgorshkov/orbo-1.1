# Admin Action Audit Log Implementation ✅

**Date:** 7 ноября 2025  
**Status:** COMPLETE  
**Time:** ~1 час

---

## 🎯 **Что это:**

**Admin Action Audit Log** - журнал действий администраторов.

**Записываем:**
- 👤 **Кто** (user_id, email)
- 🏢 **Где** (org_id, organization name)
- ✏️ **Что сделал** (action: send_test_digest, update_participant, etc.)
- 📦 **С каким ресурсом** (resource_type: digest, participant, event)
- 🔄 **Какие изменения** (changes: before/after)
- 📝 **Дополнительная информация** (metadata)
- ⏰ **Когда** (created_at)

**Зачем:**
- 🔒 **Безопасность** - кто что удалил/изменил
- 🐛 **Отладка** - что произошло перед проблемой
- 📊 **Аналитика** - какие функции используются

---

## 📊 **Архитектура:**

### **1. База данных: `admin_action_log` table** ✅
**Уже существует** (migration 076)

**Структура:**
```sql
CREATE TABLE admin_action_log (
  id BIGSERIAL PRIMARY KEY,
  
  -- Who
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- What
  action TEXT NOT NULL, -- 'send_test_digest', 'update_participant', etc.
  resource_type TEXT NOT NULL, -- 'digest', 'participant', 'event', etc.
  resource_id TEXT, -- UUID or other identifier
  
  -- Details
  changes JSONB, -- { before: {...}, after: {...} }
  metadata JSONB, -- additional context
  
  -- When
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Request context
  request_id TEXT,
  ip_address INET,
  user_agent TEXT
);
```

**Indexes:**
- `idx_admin_action_created` (created_at DESC)
- `idx_admin_action_org` (org_id, created_at DESC)
- `idx_admin_action_user` (user_id, created_at DESC)
- `idx_admin_action_resource` (resource_type, resource_id, created_at DESC)

---

### **2. API Endpoint: `/api/superadmin/audit-log`** ✅
**Файл:** `app/api/superadmin/audit-log/route.ts`

#### **GET - Fetch logs**
**Query params:**
- `org_id` (optional): filter by organization
- `user_id` (optional): filter by user
- `action` (optional): filter by action type
- `resource_type` (optional): filter by resource
- `hours` (default: 24): time range
- `limit` (default: 100): max results

**Response:**
```json
{
  "ok": true,
  "logs": [
    {
      "id": 123,
      "org_id": "...",
      "user_id": "...",
      "action": "send_test_digest",
      "resource_type": "digest",
      "resource_id": null,
      "metadata": {
        "recipient_tg_user_id": 123456,
        "cost_usd": 0.003,
        "messages_count": 150,
        "duration_ms": 2341
      },
      "created_at": "2025-11-07T20:00:00Z",
      "request_id": "iad1::abc123",
      "organizations": {
        "name": "My Community"
      },
      "users": {
        "email": "admin@example.com"
      }
    }
  ],
  "statistics": {
    "total": 50,
    "by_action": {
      "send_test_digest": 10,
      "update_participant": 25,
      "create_event": 15
    },
    "by_resource": {
      "digest": 10,
      "participant": 25,
      "event": 15
    }
  },
  "filters": {
    "org_id": null,
    "user_id": null,
    "action": null,
    "resource_type": null,
    "hours": 24,
    "limit": 100
  }
}
```

---

### **3. Utility: `logAdminAction()`** ✅
**Файл:** `lib/logAdminAction.ts`

**Usage:**
```typescript
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// Simple usage
await logAdminAction({
  orgId: '123',
  userId: '456',
  action: AdminActions.SEND_TEST_DIGEST,
  resourceType: ResourceTypes.DIGEST,
  metadata: {
    recipient_tg_user_id: 789,
    cost_usd: 0.003
  },
  requestId: request.headers.get('x-vercel-id') || undefined
});

// With changes tracking
await logAdminAction({
  orgId: '123',
  userId: '456',
  action: AdminActions.UPDATE_PARTICIPANT,
  resourceType: ResourceTypes.PARTICIPANT,
  resourceId: '789',
  changes: {
    before: { tags: ['active'] },
    after: { tags: ['active', 'vip'] }
  },
  metadata: {
    field_changed: 'tags'
  }
});
```

**Predefined constants:**
```typescript
// Actions
export const AdminActions = {
  SEND_TEST_DIGEST: 'send_test_digest',
  UPDATE_DIGEST_SETTINGS: 'update_digest_settings',
  UPDATE_PARTICIPANT: 'update_participant',
  DELETE_PARTICIPANT: 'delete_participant',
  CREATE_EVENT: 'create_event',
  UPDATE_EVENT: 'update_event',
  DELETE_EVENT: 'delete_event',
  SYNC_TELEGRAM_GROUP: 'sync_telegram_group',
  UPDATE_ORG_SETTINGS: 'update_org_settings',
  IMPORT_MESSAGES: 'import_messages',
  RESOLVE_ERROR: 'resolve_error',
  // ...
} as const;

// Resource types
export const ResourceTypes = {
  DIGEST: 'digest',
  PARTICIPANT: 'participant',
  EVENT: 'event',
  TELEGRAM_GROUP: 'telegram_group',
  ORGANIZATION: 'organization',
  ERROR: 'error',
  // ...
} as const;
```

---

### **4. UI Component: `AuditLog`** ✅
**Файл:** `components/superadmin/audit-log.tsx`

**Features:**
- ✅ Statistics cards (total, action types, resource types)
- ✅ Time filter (1h, 6h, 24h, 3d, 1w)
- ✅ Action filter (by action type)
- ✅ Resource filter (by resource type)
- ✅ Auto-refresh every 30 seconds
- ✅ Expandable log details (changes, metadata, request_id, ip_address)
- ✅ User email + Organization name display

**UI Example:**
```
┌─────────────────────────────────────────────────────────┐
│ Statistics                                               │
│ ┌───────────────┐ ┌───────────────┐ ┌────────────────┐│
│ │Total Actions  │ │Action Types   │ │Resource Types  ││
│ │      50       │ │       5       │ │       4        ││
│ └───────────────┘ └───────────────┘ └────────────────┘│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Filters                            [Refresh] (loading)  │
│ Time: [Last 24 hours v]  Action: [All v]  Resource: [All v]│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Audit Logs (50)                                          │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ [User] Send Test Digest  Digest  07.11 20:00    │    │
│ │ admin@example.com → My Community                 │    │
│ │ recipient_tg_user_id: 789  cost_usd: 0.003      │    │
│ │                                        [v]       │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─────────────────────────────────────────────────┐    │
│ │ [User] Update Participant  #abc123...  20:01    │    │
│ │ owner@example.com → My Community                │    │
│ │                                        [^]       │    │
│ └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Expanded details:**
```
┌─────────────────────────────────────────────────────┐
│ [User] Send Test Digest  Digest  07.11 20:00        │
│ admin@example.com → My Community                     │
│ recipient_tg_user_id: 789  cost_usd: 0.003          │
│                                        [^]           │
│ ─────────────────────────────────────────────────── │
│ Request ID:                                          │
│ iad1::abc123                                         │
│                                                      │
│ Metadata:                                            │
│ {                                                    │
│   "recipient_tg_user_id": 789,                       │
│   "cost_usd": 0.003,                                 │
│   "messages_count": 150,                             │
│   "duration_ms": 2341                                │
│ }                                                    │
└─────────────────────────────────────────────────────┘
```

---

### **5. Superadmin Page: `/superadmin/audit-log`** ✅
**Файл:** `app/superadmin/audit-log/page.tsx`

**Navigation:** Added to superadmin layout with FileText icon

---

## 🎨 **Примеры интеграции:**

### **Example 1: Test Digest Send** ✅ (Implemented)
**Файл:** `app/api/digest/test-send/route.ts`

```typescript
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// After successful digest send:
await logAdminAction({
  orgId,
  userId: user.id,
  action: AdminActions.SEND_TEST_DIGEST,
  resourceType: ResourceTypes.DIGEST,
  metadata: {
    recipient_tg_user_id: participant.tg_user_id,
    cost_usd: digest.cost.totalUsd,
    messages_count: digest.keyMetrics.current.messages,
    duration_ms: duration
  },
  requestId: request.headers.get('x-vercel-id') || undefined
});
```

---

### **Example 2: Update Digest Settings** (To implement)
**Файл:** `app/api/organizations/[id]/digest-settings/route.ts`

```typescript
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// In PATCH handler:
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  // ... fetch old settings
  const oldSettings = { enabled: org.digest_enabled, day: org.digest_day, time: org.digest_time };
  
  // ... update settings
  const { data: updated, error } = await supabase
    .from('organizations')
    .update({ digest_enabled, digest_day, digest_time })
    .eq('id', orgId)
    .select()
    .single();
  
  // Log action
  await logAdminAction({
    orgId,
    userId: user.id,
    action: AdminActions.UPDATE_DIGEST_SETTINGS,
    resourceType: ResourceTypes.DIGEST,
    changes: {
      before: oldSettings,
      after: { enabled: digest_enabled, day: digest_day, time: digest_time }
    },
    requestId: request.headers.get('x-vercel-id') || undefined
  });
  
  return NextResponse.json({ ok: true, settings: updated });
}
```

---

### **Example 3: Delete Participant** (To implement)
**Файл:** `app/api/participants/[participantId]/route.ts`

```typescript
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// In DELETE handler:
export async function DELETE(request: NextRequest, { params }: { params: { participantId: string } }) {
  // ... fetch participant before deletion
  const { data: participant } = await supabase
    .from('participants')
    .select('full_name, tg_user_id, tg_username')
    .eq('id', participantId)
    .single();
  
  // ... delete participant
  
  // Log action
  await logAdminAction({
    orgId,
    userId: user.id,
    action: AdminActions.DELETE_PARTICIPANT,
    resourceType: ResourceTypes.PARTICIPANT,
    resourceId: participantId,
    metadata: {
      participant_name: participant.full_name,
      tg_user_id: participant.tg_user_id,
      tg_username: participant.tg_username
    },
    requestId: request.headers.get('x-vercel-id') || undefined
  });
  
  return NextResponse.json({ ok: true });
}
```

---

### **Example 4: Create/Update Event** (To implement)
**Файл:** `app/api/events/route.ts` or `app/api/events/[eventId]/route.ts`

```typescript
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// In POST handler (create):
await logAdminAction({
  orgId,
  userId: user.id,
  action: AdminActions.CREATE_EVENT,
  resourceType: ResourceTypes.EVENT,
  resourceId: newEvent.id,
  metadata: {
    event_title: newEvent.title,
    event_date: newEvent.event_date,
    event_type: newEvent.event_type
  },
  requestId: request.headers.get('x-vercel-id') || undefined
});

// In PATCH handler (update):
await logAdminAction({
  orgId,
  userId: user.id,
  action: AdminActions.UPDATE_EVENT,
  resourceType: ResourceTypes.EVENT,
  resourceId: eventId,
  changes: {
    before: { title: oldEvent.title, status: oldEvent.status },
    after: { title: updatedEvent.title, status: updatedEvent.status }
  },
  requestId: request.headers.get('x-vercel-id') || undefined
});
```

---

### **Example 5: Mark Error as Resolved** (To implement)
**Файл:** `app/api/superadmin/errors/route.ts`

```typescript
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction';

// In PATCH handler:
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, resolved } = body;
  
  // ... update error
  
  // Log action (requires user context - superadmin only)
  const { data: { user } } = await supabase.auth.getUser();
  if (user && resolved) {
    await logAdminAction({
      orgId: '00000000-0000-0000-0000-000000000000', // Special ID for system-wide actions
      userId: user.id,
      action: AdminActions.RESOLVE_ERROR,
      resourceType: ResourceTypes.ERROR,
      resourceId: id.toString(),
      requestId: req.headers.get('x-vercel-id') || undefined
    });
  }
  
  return NextResponse.json({ ok: true });
}
```

---

## ✅ **Преимущества:**

### **Before (no audit log):**
- ❌ Не знаем, кто что сделал
- ❌ Сложно отладить проблемы
- ❌ Нет истории изменений
- ❌ Нет аналитики использования

### **After (Audit Log):**
- ✅ Полная история действий
- ✅ Фильтры (время, action, resource)
- ✅ Changes tracking (before/after)
- ✅ User + Organization context
- ✅ Statistics (by action, by resource)
- ✅ Auto-refresh (30 sec)

---

## 📋 **Файлы созданы:**

- ✅ `app/api/superadmin/audit-log/route.ts` — API endpoint
- ✅ `lib/logAdminAction.ts` — Utility for logging actions
- ✅ `components/superadmin/audit-log.tsx` — UI component
- ✅ `app/superadmin/audit-log/page.tsx` — Superadmin page
- ✅ `app/superadmin/layout.tsx` — Updated navigation
- ✅ `app/api/digest/test-send/route.ts` — Example integration (updated)
- ✅ `docs/AUDIT_LOG_IMPLEMENTATION.md` — This doc

---

## 🚀 **Deploy:**

```bash
git add app/api/superadmin/audit-log/route.ts lib/logAdminAction.ts components/superadmin/audit-log.tsx app/superadmin/audit-log/page.tsx app/superadmin/layout.tsx app/api/digest/test-send/route.ts docs/AUDIT_LOG_IMPLEMENTATION.md

git commit -m "feat: Add Admin Action Audit Log to superadmin panel

- API endpoint for fetching admin action logs
- UI component with filters and statistics
- Utility for logging admin actions
- Example integration in test digest send
- Auto-refresh every 30 seconds"

git push
```

---

## 🧪 **Testing:**

### **1. Навигация:**
- Открыть: `https://app.orbo.ru/superadmin/audit-log`
- Проверить: есть ли вкладка "Audit Log" в navigation

### **2. Empty state:**
Если логов нет, должно показываться:
```
📅 No actions in the selected time range
```

### **3. Manual test:**
Чтобы создать тестовый лог:
1. Открыть: `/app/[org]/settings/digest`
2. Нажать "Отправить тестовый дайджест"
3. Вернуться на `/superadmin/audit-log`
4. Должен появиться лог:
   - Action: "Send Test Digest"
   - Resource: "Digest"
   - User: ваш email
   - Organization: название вашей организации
   - Metadata: recipient_tg_user_id, cost_usd, messages_count, duration_ms

### **4. Filters:**
- Переключить Time Range: Last 24 hours → Last hour
- Переключить Action Type: All → Send Test Digest
- Переключить Resource Type: All → Digest
- Нажать Refresh — должны обновиться данные

### **5. Expand:**
- Нажать на стрелку → должны раскрыться детали (Request ID, Metadata)

---

## 🔜 **Next Steps (Integration):**

Добавить `logAdminAction()` в:
- ✅ Test digest send (done)
- ⏳ Update digest settings
- ⏳ Delete participant
- ⏳ Create/Update/Delete event
- ⏳ Sync Telegram group
- ⏳ Update organization settings
- ⏳ Import messages
- ⏳ Mark error as resolved

---

## ✅ **Result:**

**Status:** ✅ COMPLETE  
**Time:** ~1 час  
**Impact:** Full audit trail of admin actions in superadmin panel  
**Next:** Integrate `logAdminAction()` in other admin endpoints

