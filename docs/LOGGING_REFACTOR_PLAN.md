# План рефакторинга логирования

## Статус
- ✅ `app/api/telegram/webhook/route.ts` — **ГОТОВ** (рефакторинг выполнен)
- ❌ `lib/services/eventProcessingService.ts` — **НЕ СДЕЛАН** (90+ console.log, главный шум!)
- ❌ `lib/services/telegramAuthService.ts` — **НЕ СДЕЛАН** (58 console.log)

## Цель
Заменить `console.log` на структурированный pino logger для улучшения мониторинга в production (Dozzle, поиск по логам).

## Приоритет
🔴 **СРОЧНО** — `eventProcessingService.ts` вызывается из webhook и генерирует 90% шума в логах!

---

## 🔴 ПРИОРИТЕТ #1: eventProcessingService.ts

Этот файл генерирует **90% неструктурированных логов** в production. Примеры текущего вывода:

```
Processing message from chat ID: -1001864016932 Type: number
Found 1 organization bindings for chat -1001864016932
Processing message data: { chatId: -1001864016932, orgId: '...', messageId: 67957 }
Updated participant xxx with Telegram names: { tg_first_name: 'Александр' }
Updating metrics for group -1001864016932 in org xxx
Message count for today: 85
Group metrics updated successfully
```

### Как рефакторить:

```typescript
// В начале файла добавить:
import { createServiceLogger } from '@/lib/logger';
const logger = createServiceLogger('EventProcessing');

// Заменить:
console.log(`Processing message from chat ID: ${chatId} Type: ${typeof chatId}`);
// На:
logger.debug({ chatId, chatIdType: typeof chatId }, 'Processing message');

// Заменить:
console.log(`Found ${orgBindings.length} organization bindings for chat ${chatId}`);
// На:
logger.debug({ chatId, bindingsCount: orgBindings.length }, 'Organization bindings found');

// Заменить:
console.log('Processing message data:', { chatId, orgId, messageId, from });
// На:
logger.info({ chatId, orgId, messageId, from }, 'Processing message data');

// Заменить:
console.log(`Group metrics updated successfully`);
// На:
logger.debug({ chatId, orgId }, 'Group metrics updated');
```

---

## Как использовать logger

```typescript
// Импорт
import { createAPILogger, createServiceLogger } from '@/lib/logger';

// В API route
export async function POST(req: NextRequest) {
  const logger = createAPILogger(req, { endpoint: 'webhook/telegram' });
  
  logger.info({ chatId, userId }, 'Processing message');
  logger.warn({ error: err.message }, 'Rate limit exceeded');
  logger.error({ error, stack: error.stack }, 'Webhook failed');
}

// В сервисах
const logger = createServiceLogger('TelegramAuthService');
logger.info({ telegramUserId }, 'Starting auth');
```

### Правила логирования
1. **Всегда передавать объект первым аргументом** — для структурированных данных
2. **Сообщение — вторым аргументом** — краткое описание
3. **Уровни**: `debug` (отладка), `info` (нормальная работа), `warn` (предупреждение), `error` (ошибка)
4. **Не логировать sensitive data**: пароли, токены, полные номера телефонов

---

## Область 1: Telegram Webhooks

### Файлы для рефакторинга:

#### `app/api/telegram/webhook/route.ts`
- [ ] Заменить все `console.log('[Webhook]...')` на `logger.info/debug`
- [ ] Заменить `console.error` на `logger.error`
- [ ] Добавить контекст: `update_id`, `chat_id`, `message_type`

**Пример замены:**
```typescript
// ДО:
console.log('[Webhook] update_id:', body?.update_id, 'msg:', !!body?.message);

// ПОСЛЕ:
logger.debug({ 
  update_id: body?.update_id, 
  has_message: !!body?.message,
  chat_id: body?.message?.chat?.id 
}, 'Webhook received');
```

#### `app/api/telegram/notifications/webhook/route.ts`
- [ ] Аналогичный рефакторинг для notifications webhook

#### `lib/services/webhookRecoveryService.ts`
- [ ] Заменить console.log на logger

---

## Область 2: Авторизация

### Файлы для рефакторинга:

#### `app/auth/callback/route.ts`
- [ ] Заменить `console.log('[Auth Callback]...')` на `logger.info`
- [ ] Заменить `console.error('[Auth Callback]...')` на `logger.error`
- [ ] Добавить контекст: `userId`, `hasCode`, `redirectPath`

**Пример замены:**
```typescript
// ДО:
console.log('[Auth Callback] Processing callback:', {
  hasCode: !!code,
  origin: requestUrl.origin,
});

// ПОСЛЕ:
logger.info({ 
  hasCode: !!code, 
  origin: realOrigin 
}, 'Processing auth callback');
```

#### `lib/services/telegramAuthService.ts`
- [ ] Заменить `console.log('[Auth Service]...')` на `logger.info`
- [ ] Важные точки: создание кода, верификация, создание пользователя
- [ ] Добавить контекст: `telegramUserId`, `step`, `success`

**Пример замены:**
```typescript
// ДО:
console.log(`[Auth Service] Step 1: Received telegramUserId=${telegramUserId}`);
console.log(`[Auth Service] ✅ Auth code verified!`);

// ПОСЛЕ:
logger.info({ telegramUserId, step: 1 }, 'Auth started');
logger.info({ telegramUserId, verified: true }, 'Auth code verified');
```

#### `app/api/auth/telegram/route.ts`
- [ ] Рефакторинг авторизации через Telegram

#### `app/api/auth/telegram-code/generate/route.ts`
- [ ] Логирование генерации кодов

#### `app/api/auth/telegram-code/verify/route.ts`
- [ ] Логирование верификации кодов

---

## Область 3: Подключение Telegram

### Файлы для рефакторинга:

#### `app/api/telegram/groups/sync/route.ts`
- [ ] Заменить `console.log('[Sync]...')` на `logger.info`
- [ ] Добавить контекст: `orgId`, `userId`, `groupsFound`

#### `app/api/telegram/groups/connect/route.ts`
- [ ] Логирование подключения групп

#### `app/api/user/profile/route.ts`
- [ ] Заменить `console.log('[Profile API]...')` на `logger.info`
- [ ] Важно: привязка Telegram аккаунта

**Пример замены:**
```typescript
// ДО:
console.log('[Profile API] ========== PROFILE REQUEST START ==========');
console.log('[Profile API] User ID:', user.id);
console.log('[Profile API] Telegram account found:', !!telegramAccount);

// ПОСЛЕ:
logger.info({ 
  userId: user.id, 
  orgId,
  hasTelegramAccount: !!telegramAccount 
}, 'Profile request started');
```

---

## Бонус: Другие важные файлы

### Layout и страницы (низкий приоритет)
- `app/app/[org]/layout.tsx` — `console.log('=== OrgLayout...')`
- `app/orgs/page.tsx` — `console.log('[Orgs Page]...')`

### Сервисы импорта
- `app/api/telegram/import-history/[id]/import/route.ts`

---

## Тестирование

После рефакторинга проверить в Dozzle:
1. Открыть http://localhost:9999 (через SSH туннель)
2. Фильтр `level:info` — должны показываться структурированные логи
3. Фильтр `level:error` — только ошибки
4. Поиск по `endpoint:webhook` — логи конкретного endpoint

---

## Чеклист готовности

- [ ] Webhook main — структурированные логи
- [ ] Webhook notifications — структурированные логи
- [ ] Auth callback — структурированные логи
- [ ] Telegram auth service — структурированные логи
- [ ] Telegram code generation/verification — структурированные логи
- [ ] Groups sync — структурированные логи
- [ ] Profile API — структурированные логи
- [ ] Проверка в Dozzle — фильтры работают

---

## Примечания

1. **Не удалять старые логи сразу** — можно закомментировать и проверить что новые работают
2. **Коммитить по частям** — по одной области за раз
3. **Проверять в production** — после деплоя смотреть в Dozzle

