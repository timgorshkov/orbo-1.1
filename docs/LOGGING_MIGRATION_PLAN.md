# План полной миграции логирования на структурированный pino logger

## Статус миграции

### ✅ Выполнено (Этап 1-3)
- ✅ Telegram Webhooks (`app/api/telegram/webhook/route.ts`, `app/api/telegram/notifications/webhook/route.ts`)
- ✅ Event Processing Service (`lib/services/eventProcessingService.ts`)
- ✅ Webhook Recovery Service (`lib/services/webhookRecoveryService.ts`)
- ✅ Telegram Auth Service (`lib/services/telegramAuthService.ts`)
- ✅ Auth Callback (`app/auth/callback/route.ts`)
- ✅ Import History (`app/api/telegram/import-history/[id]/import/route.ts`)
- ✅ OpenAI Service (`lib/services/enrichment/openaiService.ts`)
- ✅ Layout & Pages (`app/app/[org]/layout.tsx`, `app/orgs/page.tsx`, `app/page.tsx`)
- ✅ Superadmin (`lib/server/superadminGuard.ts`, `app/superadmin/*`, `app/api/superadmin/*`)

### 📊 Статистика
- **Всего файлов с console.log**: ~228
- **API routes**: ~150 файлов
- **Services**: ~30 файлов
- **Components**: ~40 файлов
- **Cron jobs**: ~8 файлов
- **Утилиты**: ~10 файлов

---

## Приоритеты миграции

### 🔴 КРИТИЧНО (Этап 4) - Обработка ошибок и критичные сервисы

**Цель**: Обеспечить корректное логирование всех ошибок для отладки в Dozzle.

#### 4.1 Cron Jobs (8 файлов)
**Приоритет**: ВЫСОКИЙ - регулярные задачи, могут генерировать ошибки

- [ ] `app/api/cron/sync-admin-rights/route.ts` (16 console.log)
- [ ] `app/api/cron/send-event-reminders/route.ts`
- [ ] `app/api/cron/sync-users/route.ts`
- [ ] `app/api/cron/update-participant-roles/route.ts`
- [ ] `app/api/cron/event-notifications/route.ts`
- [ ] `app/api/cron/send-weekly-digests/route.ts`
- [ ] Другие cron jobs

**Оценка**: 2-3 часа

#### 4.2 Критичные сервисы (10 файлов)
**Приоритет**: ВЫСОКИЙ - используются в критичных операциях

- [ ] `lib/services/telegramService.ts` (7 console.log)
- [ ] `lib/services/aiConstructorService.ts` (10 console.log)
- [ ] `lib/services/telegramNotificationService.ts`
- [ ] `lib/services/emailService.ts`
- [ ] `lib/services/appsNotificationService.ts`
- [ ] `lib/services/participantStatsService.ts`
- [ ] `lib/services/participantEnrichmentService.ts`
- [ ] `lib/services/telegramJsonParser.ts`
- [ ] `lib/services/telegramHistoryParser.ts`
- [ ] `lib/services/participants/matcher.ts`

**Оценка**: 3-4 часа

#### 4.3 WhatsApp Import (1 файл)
**Приоритет**: ВЫСОКИЙ - часто используется, может генерировать ошибки

- [ ] `app/api/whatsapp/import/route.ts` (35 console.log)

**Оценка**: 1 час

---

### 🟡 ВАЖНО (Этап 5) - API Routes для основных функций

**Цель**: Обеспечить логирование всех API endpoints для отслеживания проблем пользователей.

#### 5.1 Telegram API Routes (20+ файлов)
- [ ] `app/api/telegram/groups/sync/route.ts`
- [ ] `app/api/telegram/groups/connect/route.ts`
- [ ] `app/api/telegram/groups/add-to-org/route.ts`
- [ ] `app/api/telegram/groups/remove/route.ts`
- [ ] `app/api/telegram/groups/update-admin-rights/route.ts`
- [ ] `app/api/telegram/groups/update-admins/route.ts`
- [ ] `app/api/telegram/groups/verify-admin/route.ts`
- [ ] `app/api/telegram/groups/migrate-chat/route.ts`
- [ ] `app/api/telegram/groups/for-user/route.ts`
- [ ] `app/api/telegram/groups/detail/route.ts`
- [ ] `app/api/telegram/groups/clone-to-org/route.ts`
- [ ] `app/api/telegram/groups/archive/route.ts`
- [ ] `app/api/telegram/groups/[orgId]/route.ts`
- [ ] `app/api/telegram/admin/*` (4 файла)
- [ ] `app/api/telegram/bot/*` (6 файлов)
- [ ] `app/api/telegram/analytics/*`
- [ ] `app/api/telegram/import-history/[id]/parse/route.ts`
- [ ] `app/api/telegram/notifications/send/route.ts`
- [ ] `app/api/telegram/notifications/send-verification/route.ts`
- [ ] `app/api/telegram/health/route.ts`

**Оценка**: 4-5 часов

#### 5.2 Events API Routes (15+ файлов)
- [ ] `app/api/events/route.ts`
- [ ] `app/api/events/[id]/route.ts`
- [ ] `app/api/events/[id]/register/route.ts`
- [ ] `app/api/events/[id]/participants/route.ts`
- [ ] `app/api/events/[id]/participants/[registrationId]/route.ts`
- [ ] `app/api/events/[id]/payments/route.ts`
- [ ] `app/api/events/[id]/payments/[registrationId]/route.ts`
- [ ] `app/api/events/[id]/payments/stats/route.ts`
- [ ] `app/api/events/[id]/notify/route.ts`
- [ ] `app/api/events/[id]/ics/route.ts`
- [ ] `app/api/events/[id]/cover/route.ts`
- [ ] `app/api/events/[id]/registration-fields/route.ts`
- [ ] `app/api/events/[id]/my-registration/route.ts`
- [ ] `app/api/events/checkin/route.ts`

**Оценка**: 3-4 часа

#### 5.3 Participants API Routes (10+ файлов)
- [ ] `app/api/participants/create/route.ts`
- [ ] `app/api/participants/[participantId]/route.ts`
- [ ] `app/api/participants/[participantId]/enrich-ai/route.ts`
- [ ] `app/api/participants/[participantId]/photo/route.ts`
- [ ] `app/api/participants/[participantId]/sync-telegram-photo/route.ts`
- [ ] `app/api/participants/enrich/route.ts`
- [ ] `app/api/participants/check-duplicates/route.ts`

**Оценка**: 2-3 часа

#### 5.4 Organizations API Routes (15+ файлов)
- [ ] `app/api/organizations/route.ts`
- [ ] `app/api/organizations/[id]/route.ts`
- [ ] `app/api/organizations/[id]/logo/route.ts`
- [ ] `app/api/organizations/[id]/team/route.ts`
- [ ] `app/api/organizations/[id]/team/add/route.ts`
- [ ] `app/api/organizations/[id]/invites/route.ts`
- [ ] `app/api/organizations/[id]/invites/[inviteId]/route.ts`
- [ ] `app/api/organizations/[id]/public/route.ts`
- [ ] `app/api/organizations/[id]/home/route.ts`
- [ ] `app/api/organizations/info/route.ts`
- [ ] `app/api/organizations/list/route.ts`

**Оценка**: 2-3 часа

#### 5.5 Analytics API Routes (6 файлов)
- [ ] `app/api/analytics/[orgId]/key-metrics/route.ts`
- [ ] `app/api/analytics/[orgId]/timeline/route.ts`
- [ ] `app/api/analytics/[orgId]/engagement/route.ts`
- [ ] `app/api/analytics/[orgId]/heatmap/route.ts`
- [ ] `app/api/analytics/[orgId]/contributors/route.ts`
- [ ] `app/api/analytics/[orgId]/reactions-replies/route.ts`

**Оценка**: 1-2 часа

#### 5.6 Auth API Routes (8+ файлов)
- [ ] `app/api/auth/telegram-code/generate/route.ts`
- [ ] `app/api/auth/telegram-code/verify/route.ts`
- [ ] `app/api/auth/telegram-code/status/route.ts`
- [ ] `app/api/auth/logout/route.ts`
- [ ] `app/api/auth/activate-profile/route.ts`
- [ ] `app/auth/telegram-handler/route.ts`
- [ ] `app/auth/telegram-fallback/route.ts`

**Оценка**: 1-2 часа

#### 5.7 Другие API Routes (20+ файлов)
- [ ] `app/api/user/profile/route.ts` (уже частично сделано)
- [ ] `app/api/user/telegram-id/route.ts`
- [ ] `app/api/dashboard/[orgId]/route.ts`
- [ ] `app/api/digest/*` (4 файла)
- [ ] `app/api/materials/*` (4 файла)
- [ ] `app/api/memberships/route.ts`
- [ ] `app/api/health/route.ts`
- [ ] `app/api/debug/health-widget/route.ts`

**Оценка**: 3-4 часа

---

### 🟢 СРЕДНИЙ ПРИОРИТЕТ (Этап 6) - Server Components и утилиты

#### 6.1 Server Utilities (10+ файлов)
- [ ] `lib/server/getOrgTelegramGroups.ts`
- [ ] `lib/server/syncOrgAdmins.ts`
- [ ] `lib/server/getParticipantDetail.ts`
- [ ] `lib/server/getHomePageData.ts`
- [ ] `lib/orgGuard.ts`
- [ ] `lib/getOrgInfo.ts`
- [ ] `lib/auth/getUserRole.ts`
- [ ] `lib/logErrorToDatabase.ts`
- [ ] `lib/logAdminAction.ts`

**Оценка**: 2-3 часа

#### 6.2 Database & Storage (3 файла)
- [ ] `lib/db/postgres-client.ts`
- [ ] `lib/db/supabase-client.ts`
- [ ] `lib/storage/s3-storage.ts`

**Оценка**: 1 час

#### 6.3 Middleware (1 файл)
- [ ] `middleware.ts`

**Оценка**: 30 минут

---

### 🔵 НИЗКИЙ ПРИОРИТЕТ (Этап 7) - Client Components и Pages

**Примечание**: Компоненты клиентской части менее критичны для production логирования, но стоит мигрировать для консистентности.

#### 7.1 Client Components (40+ файлов)
- [ ] `components/events/*`
- [ ] `components/members/*`
- [ ] `components/analytics/*`
- [ ] `components/settings/*`
- [ ] `components/apps/*`
- [ ] `components/materials/*`
- [ ] `components/superadmin/*`
- [ ] Другие компоненты

**Оценка**: 4-5 часов (можно делать постепенно)

#### 7.2 Client Pages (30+ файлов)
- [ ] `app/p/[org]/*`
- [ ] `app/app/[org]/*`
- [ ] `app/(auth)/*`
- [ ] Другие страницы

**Оценка**: 3-4 часа (можно делать постепенно)

---

## Стратегия выполнения

### Подход 1: По этапам (рекомендуется)
1. **Этап 4** (Критично) - 6-8 часов
2. **Этап 5** (Важно) - 15-20 часов
3. **Этап 6** (Средний) - 3-4 часа
4. **Этап 7** (Низкий) - 7-9 часов (можно делать постепенно)

**Общее время**: ~35-40 часов работы

### Подход 2: По областям (альтернатива)
1. Все Cron Jobs
2. Все Telegram API
3. Все Events API
4. Все Participants API
5. Все Organizations API
6. Остальные API
7. Services
8. Components

---

## Правила миграции

### 1. Импорт logger
```typescript
// Для API routes
import { createAPILogger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'api/endpoint/name' });
  // ...
}

// Для сервисов
import { createServiceLogger } from '@/lib/logger';

const logger = createServiceLogger('ServiceName');
```

### 2. Замена console.log
```typescript
// ДО:
console.log('[Service] Processing data:', { userId, orgId });
console.error('[Service] Error:', error);
console.warn('[Service] Warning:', message);

// ПОСЛЕ:
logger.info({ userId, orgId }, 'Processing data');
logger.error({ error: error.message, stack: error.stack }, 'Error occurred');
logger.warn({ message }, 'Warning');
```

### 3. Уровни логирования
- `logger.debug()` - детальная отладочная информация (только в dev)
- `logger.info()` - нормальная работа, важные события
- `logger.warn()` - предупреждения, не критичные проблемы
- `logger.error()` - ошибки, исключения

### 4. Контекст в логах
Всегда добавлять релевантный контекст:
- `userId`, `orgId`, `chatId` - идентификаторы
- `error.message`, `error.stack` - для ошибок
- `duration_ms` - для производительности
- `count`, `status` - для статистики

### 5. Не логировать sensitive data
- Пароли, токены (только первые 5 символов)
- Полные номера телефонов (только последние 4 цифры)
- Персональные данные (с осторожностью)

---

## Чеклист проверки после миграции

После каждого этапа проверить в Dozzle:
- [ ] Логи имеют структурированный формат (JSON)
- [ ] Поля `level`, `time`, `msg` присутствуют
- [ ] Контекст передается в объекте (не в строке)
- [ ] Фильтры по `level`, `endpoint`, `service` работают
- [ ] Поиск по полям работает корректно
- [ ] Нет дублирования логов (старые + новые)

---

## Метрики успеха

- ✅ 0 `console.log` в критичных файлах (API routes, Services, Cron)
- ✅ Все ошибки логируются с контекстом
- ✅ Возможность фильтрации по `level`, `endpoint`, `service` в Dozzle
- ✅ Улучшенная отладка production ошибок

---

## Примечания

1. **Коммитить по этапам** - не делать один большой коммит
2. **Тестировать после каждого этапа** - проверять в Dozzle
3. **Не удалять старые логи сразу** - можно оставить закомментированными на первое время
4. **Документировать изменения** - обновлять этот план по мере выполнения

---

## Следующие шаги

1. Начать с **Этапа 4** (Критично) - Cron Jobs и критичные сервисы
2. После завершения этапа - коммит и проверка в Dozzle
3. Перейти к **Этапу 5** (Важно) - API Routes
4. Продолжить по плану

