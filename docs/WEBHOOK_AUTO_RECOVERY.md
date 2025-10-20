# Автоматическое восстановление Telegram Webhooks

## Проблема
Telegram webhook периодически теряется или сбрасывается, что приводит к:
- Перестают приходить обновления от Telegram
- Боты перестают реагировать на сообщения
- Аналитика не обновляется

## Решение: Многоуровневая система защиты

### Уровень 1: Автоматическое восстановление при ошибке
**Как работает:**
- При получении webhook запроса с неверным `secret_token`, система автоматически пытается восстановить webhook
- Ограничения: не более 3 попыток в час, с cooldown 20 минут между попытками

**Логика:**
1. Telegram отправляет webhook запрос
2. Наш сервер проверяет `secret_token`
3. Если `secret_token` неверный → автоматически вызывается `webhookRecoveryService.recoverWebhook()`
4. Webhook восстанавливается с правильным `secret_token`
5. Следующий запрос от Telegram уже работает корректно

**Файлы:**
- `lib/services/webhookRecoveryService.ts` - сервис восстановления
- `app/api/telegram/webhook/route.ts` - main bot endpoint
- `app/api/telegram/notifications/webhook/route.ts` - notifications bot endpoint

### Уровень 2: Регулярный мониторинг (GitHub Actions)
**Как работает:**
- GitHub Action запускается каждые 30 минут
- Проверяет состояние webhook для обоих ботов
- Если webhook неправильно настроен → автоматически восстанавливает

**Настройка:**
1. В GitHub Settings → Secrets добавьте:
   - `NEXT_PUBLIC_APP_URL` - URL приложения (например, `https://app.orbo.ru`)

2. GitHub Action автоматически запустится по расписанию

**Файл:**
- `.github/workflows/monitor-webhooks.yml`

### Уровень 3: Ручная проверка и восстановление

#### API Endpoints

**1. GET `/api/telegram/admin/monitor-webhooks`**
Проверяет состояние webhook и автоматически восстанавливает при необходимости.

**Пример использования:**
```bash
curl https://app.orbo.ru/api/telegram/admin/monitor-webhooks
```

**Ответ:**
```json
{
  "success": true,
  "timestamp": "2025-10-20T06:00:00.000Z",
  "webhooks": {
    "main": {
      "bot": "main",
      "configured": true,
      "url": "https://app.orbo.ru/api/telegram/webhook",
      "pendingUpdates": 0,
      "lastError": null
    },
    "notifications": {
      "bot": "notifications",
      "configured": true,
      "url": "https://app.orbo.ru/api/telegram/notifications/webhook",
      "pendingUpdates": 0,
      "lastError": null
    }
  },
  "recoveryActions": [],
  "recoveryStats": {
    "main": [],
    "notifications": []
  },
  "allConfigured": true
}
```

**2. POST `/api/telegram/admin/monitor-webhooks`**
Принудительное восстановление webhook (игнорирует rate limiting).

**Пример использования:**
```bash
# Восстановить оба бота
curl -X POST https://app.orbo.ru/api/telegram/admin/monitor-webhooks \
  -H "Content-Type: application/json" \
  -d '{"bot": "both"}'

# Восстановить только main bot
curl -X POST https://app.orbo.ru/api/telegram/admin/monitor-webhooks \
  -H "Content-Type: application/json" \
  -d '{"bot": "main"}'

# Восстановить только notifications bot
curl -X POST https://app.orbo.ru/api/telegram/admin/monitor-webhooks \
  -H "Content-Type: application/json" \
  -d '{"bot": "notifications"}'
```

## Rate Limiting

Для предотвращения бесконечных попыток восстановления:
- **Максимум 3 попытки в час** для каждого бота
- **Cooldown 20 минут** между попытками
- **Статистика восстановлений** хранится в памяти (за последние 24 часа)

## Мониторинг

### Логи Vercel
При автоматическом восстановлении вы увидите:
```
[Webhook Recovery] ========== RECOVERY ATTEMPT START ==========
[Webhook Recovery] Bot: main
[Webhook Recovery] Reason: secret_token_mismatch
[Webhook Recovery] Setting webhook URL: https://app.orbo.ru/api/telegram/webhook
[Webhook Recovery] ✅ Webhook successfully recovered for main bot
[Webhook Recovery] ========== RECOVERY ATTEMPT END ==========
```

### GitHub Actions
В GitHub Actions → monitor-webhooks вы увидите:
```
✅ All webhooks are properly configured
```
или
```
⚠️ Some webhooks are misconfigured
Recovery actions: [...]
```

## Уведомления (опционально)

Можно настроить отправку уведомлений в Telegram канал:

1. Создайте канал для мониторинга
2. Добавьте `@orbo_assistant_bot` в канал
3. Получите `chat_id` канала
4. Добавьте в Vercel Environment Variables:
   ```
   TELEGRAM_MONITORING_CHANNEL_ID=-1001234567890
   ```

После этого при каждом восстановлении webhook будет приходить уведомление:
- ✅ Webhook для main бота восстановлен автоматически
- ❌ Не удалось восстановить webhook для notifications бота: [error]

## Тестирование

### 1. Проверка текущего состояния
```bash
curl https://app.orbo.ru/api/telegram/admin/monitor-webhooks
```

### 2. Принудительное восстановление
```bash
curl -X POST https://app.orbo.ru/api/telegram/admin/monitor-webhooks \
  -H "Content-Type: application/json" \
  -d '{"bot": "both"}'
```

### 3. Проверка GitHub Action
1. Перейдите в GitHub → Actions → Monitor Telegram Webhooks
2. Нажмите "Run workflow"
3. Проверьте логи выполнения

## FAQ

### Почему webhook теряется?
- Telegram периодически сбрасывает webhook (особенно при долгих перерывах в работе)
- Кто-то может случайно вызвать `setWebhook` без `secret_token`
- Проблемы на стороне Telegram Bot API

### Как часто проверять webhook?
- **Автоматическое восстановление при ошибке**: мгновенно при первом неудачном запросе
- **GitHub Action**: каждые 30 минут (можно изменить в `.github/workflows/monitor-webhooks.yml`)

### Можно ли отключить автоматическое восстановление?
Да, закомментируйте вызов в webhook endpoints:
```typescript
// webhookRecoveryService.recoverWebhook('main', 'secret_token_mismatch').catch(...);
```

### Как посмотреть статистику восстановлений?
```bash
curl https://app.orbo.ru/api/telegram/admin/monitor-webhooks | jq '.recoveryStats'
```

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                       Telegram Bot API                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Отправляет webhook
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    app.orbo.ru/api/telegram/webhook             │
│                                                                  │
│  1. Проверяет secret_token                                      │
│  2. Если неверный → вызывает webhookRecoveryService             │
│  3. Сервис восстанавливает webhook с правильным secret          │
└─────────────────────────────────────────────────────────────────┘
                             ▲
                             │
                             │ Проверяет каждые 30 минут
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Action (Cron)                        │
│                                                                  │
│  GET /api/telegram/admin/monitor-webhooks                       │
│  - Проверяет состояние webhook                                  │
│  - Восстанавливает при необходимости                            │
└─────────────────────────────────────────────────────────────────┘
```

## Дата
2025-10-20

## Автор
AI Assistant (Claude Sonnet 4.5)

