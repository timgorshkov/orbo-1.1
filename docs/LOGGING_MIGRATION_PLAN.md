# План полной миграции логирования на структурированный pino logger

## 📊 АКТУАЛЬНЫЙ СТАТУС (Обновлено: 18.12.2024)

### Общая статистика
- **Начальное количество console.log**: ~350
- **Текущее количество**: ~170 (почти все в components/*)
- **Прогресс**: ~51% завершено (серверный код — 100%)

| Область | Было | Осталось | Статус |
|---------|------|----------|--------|
| app/api/* (все API routes) | ~150 | **0** | ✅ 100% |
| app/api/cron/* | ~71 | **0** | ✅ 100% |
| app/api/telegram/* | ~80 | **0** | ✅ 100% |
| app/api/events/* | ~20 | **0** | ✅ 100% |
| app/api/participants/* | ~15 | **0** | ✅ 100% |
| app/api/organizations/* | ~25 | **0** | ✅ 100% |
| app/api/analytics/* | ~10 | **0** | ✅ 100% |
| app/api/auth/* | ~15 | **0** | ✅ 100% |
| lib/services/* (основные) | ~50 | **0** | ✅ 100% |
| lib/services/enrichment/* | ~10 | **10** (JSDoc) | ✅ N/A |
| lib/server/* | ~30 | **0** | ✅ 100% |
| lib/*.ts (утилиты) | ~20 | **0** | ✅ 100% |
| middleware.ts | ~3 | **0** | ✅ 100% |
| app/p/[org]/* (public pages) | ~40 | **0** | ✅ 100% |
| app/app/[org]/* (admin pages) | ~21 | **1** (коммент.) | ✅ 100% |
| app/auth/* | ~5 | **2** | ⚠️ 60% |
| components/* | ~150 | **147** | 🔵 Опционально |

---

## ✅ ПОЛНОСТЬЮ ВЫПОЛНЕНО

### Этап 1-3: Критичные сервисы и webhooks
- ✅ Telegram Webhooks (`app/api/telegram/webhook/route.ts`, `app/api/telegram/notifications/webhook/route.ts`)
- ✅ Event Processing Service (`lib/services/eventProcessingService.ts`)
- ✅ Webhook Recovery Service (`lib/services/webhookRecoveryService.ts`)
- ✅ Telegram Auth Service (`lib/services/telegramAuthService.ts`)
- ✅ Auth Callback (`app/auth/callback/route.ts`)

### Этап 4: Cron Jobs и критичные сервисы
- ✅ `app/api/cron/sync-admin-rights/route.ts`
- ✅ `app/api/cron/send-event-reminders/route.ts`
- ✅ `app/api/cron/sync-users/route.ts`
- ✅ `app/api/cron/update-participant-roles/route.ts`
- ✅ `app/api/cron/event-notifications/route.ts`
- ✅ `app/api/cron/send-weekly-digests/route.ts`
- ✅ `lib/services/telegramService.ts`
- ✅ `lib/services/aiConstructorService.ts`
- ✅ `lib/services/telegramNotificationService.ts`
- ✅ `lib/services/emailService.ts`
- ✅ `lib/services/appsNotificationService.ts`
- ✅ `lib/services/participantStatsService.ts`
- ✅ `lib/services/participantEnrichmentService.ts`
- ✅ `app/api/whatsapp/import/route.ts`

### Этап 5: Все API Routes
- ✅ **Все 28+ Telegram API Routes** полностью мигрированы
- ✅ **Все 15 Events API Routes** полностью мигрированы
- ✅ **Все 7 Participants API Routes** полностью мигрированы
- ✅ **Все 12 Organizations API Routes** полностью мигрированы
- ✅ **Все 6 Analytics API Routes** полностью мигрированы
- ✅ **Все 8 Auth API Routes** полностью мигрированы
- ✅ **Все остальные API Routes** (digest, materials, health, debug, etc.)

### Этап 6: Server Utilities
- ✅ `lib/server/getOrgTelegramGroups.ts`
- ✅ `lib/server/syncOrgAdmins.ts`
- ✅ `lib/server/getParticipantDetail.ts`
- ✅ `lib/server/getHomePageData.ts`
- ✅ `lib/server/superadminGuard.ts`
- ✅ `lib/orgGuard.ts`
- ✅ `lib/getOrgInfo.ts`
- ✅ `lib/auth/getUserRole.ts`
- ✅ `lib/logErrorToDatabase.ts`
- ✅ `lib/logAdminAction.ts`
- ✅ `lib/db/postgres-client.ts`
- ✅ `lib/db/supabase-client.ts`
- ✅ `lib/storage/s3-storage.ts`
- ✅ `middleware.ts`
- ✅ `lib/hawk.ts`
- ✅ `lib/services/openaiClient.ts`
- ✅ `lib/auth/nextauth.ts`

### Этап 7 (частично): Public Pages
- ✅ **Все app/p/[org]/* страницы** полностью мигрированы

---

## ⚠️ ОСТАЛОСЬ СДЕЛАТЬ

### ✅ ВЫПОЛНЕНО: lib/services/enrichment (10 console.log, 3 файла)
Все `console.log` находятся в JSDoc комментариях (примеры использования) — не требует изменений.

### ✅ ВЫПОЛНЕНО: Admin Panel Pages (18 → 0 console.log, ~12 файлов)
Все страницы админ-панели мигрированы на структурированное логирование.

Мигрированные файлы:
- ✅ `app/app/[org]/apps/[appId]/page.tsx`
- ✅ `app/app/[org]/apps/[appId]/moderation/page.tsx`
- ✅ `app/app/[org]/apps/[appId]/edit/page.tsx`
- ✅ `app/app/[org]/telegram/groups/page.tsx`
- ✅ `app/app/[org]/telegram/groups/[id]/analytics/page.tsx`
- ✅ `app/app/[org]/telegram/analytics/page.tsx`
- ✅ `app/app/[org]/telegram/setup-telegram/page.tsx`
- ✅ `app/app/[org]/telegram/check-groups/page.tsx`
- ✅ `app/app/[org]/telegram/add-verified-group.tsx`
- ✅ `app/app/[org]/telegram/components/check-groups-form.tsx`
- ✅ `app/app/[org]/telegram/components/group-selection-card.tsx`
- ✅ `app/app/[org]/materials/data.ts`
- ⚪ `app/app/[org]/events/[id]/page.tsx` — 1 console.log в закомментированном коде

### Низкий приоритет: Auth Pages (2 console.log, 2 файла)

| Файл | console.log |
|------|-------------|
| `app/auth/telegram-fallback/route.ts` | 1 |
| `app/auth/telegram/page.tsx` | 1 |

**Оценка**: 15 минут

### Низкий приоритет: Hooks (2 console.log, 1 файл)

| Файл | console.log |
|------|-------------|
| `lib/hooks/useTelegramPhoto.ts` | 2 |

**Оценка**: 10 минут

---

## 🔵 ОПЦИОНАЛЬНО / НЕ КРИТИЧНО

### Components (147 console.log, 39 файлов)

Компоненты клиентской части. **Рекомендация**: мигрировать постепенно по мере работы с ними.

**Топ-10 файлов с наибольшим количеством console.log:**

| Файл | console.log | Рекомендация |
|------|-------------|--------------|
| `components/materials/materials-page-editor.tsx` | 67 | ⚪ Низкий приоритет |
| `components/ai-constructor/ai-constructor-chat.tsx` | 10 | 🟡 Средний |
| `components/superadmin/telegram-health-status.tsx` | 9 | ⚪ Низкий |
| `components/events/event-detail.tsx` | 4 | 🟡 Средний |
| `components/materials/materials-tree.tsx` | 4 | ⚪ Низкий |
| `components/settings/tags-management-content.tsx` | 3 | ⚪ Низкий |
| `components/members/participant-tags-manager.tsx` | 3 | ⚪ Низкий |
| `components/materials/materials-page-viewer.tsx` | 3 | ⚪ Низкий |
| `components/events/access-denied-with-auth.tsx` | 3 | ⚪ Низкий |
| Остальные 30 файлов | 1-2 каждый | ⚪ Низкий |

**Оценка общая**: 4-6 часов (если делать все)

---

## 📋 РЕКОМЕНДАЦИИ

### ✅ ВСЁ СЕРВЕРНОЕ ЛОГИРОВАНИЕ ЗАВЕРШЕНО!
1. ✅ **lib/services/enrichment/** - JSDoc комментарии, не требует изменений
2. ✅ **app/app/[org]/\*** - admin panel полностью мигрирована

### Что МОЖНО отложить (средний ROI):
3. 🔵 **app/auth/** - редко используемые fallback routes
4. 🔵 **lib/hooks/** - клиентский код, не виден в Dozzle

### Что НЕ КРИТИЧНО (низкий ROI):
5. ⚪ **components/** - клиентские компоненты, логи идут в браузер, не в Dozzle
   - Исключение: серверные компоненты с `'use server'`
   - Можно мигрировать постепенно по мере работы с файлами

---

## 📈 ИТОГИ

### Достигнуто:
- ✅ **100% серверных API routes** мигрированы на структурированное логирование
- ✅ **100% cron jobs** мигрированы
- ✅ **100% критичных сервисов** мигрированы
- ✅ **100% middleware и server utilities** мигрированы
- ✅ **100% admin panel pages** мигрированы
- ✅ **100% public pages** мигрированы
- ✅ Все ошибки сервера теперь видны в Dozzle с контекстом
- ✅ Возможность фильтрации по `level`, `service`, `endpoint`, `component`

### Осталось (опционально):
- 🔵 ~2 console.log в app/auth/* (15 мин) — редко используемые fallback routes
- ⚪ ~147 console.log в components/* (4-6 часов) — клиентский код, не виден в Dozzle

### 🎉 СЕРВЕРНОЕ ЛОГИРОВАНИЕ ЗАВЕРШЕНО НА 100%!
Все ошибки сервера теперь логируются структурированно и видны в Dozzle.

---

## Правила миграции (напоминание)

```typescript
// Для API routes
import { createAPILogger } from '@/lib/logger';
const logger = createAPILogger(req, { endpoint: 'api/endpoint/name' });

// Для сервисов
import { createServiceLogger } from '@/lib/logger';
const logger = createServiceLogger('ServiceName');

// Для клиентских компонентов
import { createClientLogger } from '@/lib/logger';
const clientLogger = createClientLogger('ComponentName', { orgId });

// Замена:
// console.log('[Service] Processing:', data) → logger.info({ data }, 'Processing');
// console.error('[Service] Error:', err) → logger.error({ error: err.message, stack: err.stack }, 'Error');
```
