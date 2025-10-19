# Исправление ошибки секретного токена webhook

## Проблема

В логах Vercel появляется ошибка каждые несколько минут:
```
[Webhook POST] ❌ Unauthorized - secret token mismatch
[Webhook POST] Expected secret length: 32
[Webhook POST] Received secret length: 48
```

Это означает, что webhook был настроен с секретным токеном длиной 48 символов, а в переменных окружения Vercel установлен токен длиной 32 символа.

## Важно: Два отдельных секрета

В приложении используются **два разных бота**:

1. **Основной бот** (`/api/telegram/webhook`):
   - Использует `TELEGRAM_WEBHOOK_SECRET`
   - Обрабатывает сообщения в группах, команды, коды авторизации

2. **Бот уведомлений** (`/api/telegram/notifications/webhook`):
   - Приоритетно использует `TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET`
   - Fallback на `TELEGRAM_WEBHOOK_SECRET` если отдельный секрет не установлен
   - Отправляет коды верификации и уведомления

**Рекомендация:** Используйте разные секреты для каждого бота для лучшей безопасности.

## Решение

### Шаг 1: Определить, какой бот вызывает ошибку

После обновления кода логи будут четко показывать, какой именно бот вызывает ошибку:

```
[Main Bot Webhook] ❌ Unauthorized - secret token mismatch
```
или
```
[Notifications Bot Webhook] ❌ Unauthorized - secret token mismatch
```

### Шаг 2: Проверить текущее состояние webhooks

Откройте в браузере:
```
https://app.orbo.ru/api/telegram/admin/reset-webhook?password=YOUR_ADMIN_PASSWORD
```

Замените `YOUR_ADMIN_PASSWORD` на значение переменной окружения `ADMIN_PASSWORD` из Vercel.

Вы увидите:
- Текущую конфигурацию webhooks для обоих ботов
- Какие переменные окружения установлены
- Длину ожидаемых секретов

### Шаг 3: Переустановить webhooks с правильными секретами

**Вариант A: Переустановить оба бота**

```bash
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "password": "YOUR_ADMIN_PASSWORD"
  }'
```

**Вариант B: Переустановить только проблемный бот**

Если логи показали, что ошибку вызывает основной бот:

```bash
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "password": "YOUR_ADMIN_PASSWORD",
    "botType": "main"
  }'
```

Если логи показали, что ошибку вызывает бот уведомлений:

```bash
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "password": "YOUR_ADMIN_PASSWORD",
    "botType": "notifications"
  }'
```

### Шаг 4: Проверить результат

После переустановки webhooks:
1. Проверьте логи Vercel - ошибки должны прекратиться
2. Отправьте тестовое сообщение боту в Telegram
3. Убедитесь, что бот отвечает

## Альтернативное решение (ручное)

Если по какой-то причине автоматическое решение не работает, можно переустановить webhooks вручную:

### Для основного бота:

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://app.orbo.ru/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

### Для бота уведомлений:

```
https://api.telegram.org/bot<TELEGRAM_NOTIFICATIONS_BOT_TOKEN>/setWebhook?url=https://app.orbo.ru/api/telegram/notifications/webhook&secret_token=<SECRET>
```

Где `<SECRET>` это:
- `<TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET>` если установлен (рекомендуется)
- или `<TELEGRAM_WEBHOOK_SECRET>` если используется общий секрет

Замените:
- `<TELEGRAM_BOT_TOKEN>` - токен основного бота
- `<TELEGRAM_NOTIFICATIONS_BOT_TOKEN>` - токен бота уведомлений
- `<TELEGRAM_WEBHOOK_SECRET>` - секретный токен основного бота
- `<TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET>` - секретный токен бота уведомлений (если используется)

## Проверка конфигурации

Проверить текущую конфигурацию webhooks можно напрямую через Telegram API:

```
# Основной бот
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo

# Бот уведомлений
https://api.telegram.org/bot<TELEGRAM_NOTIFICATIONS_BOT_TOKEN>/getWebhookInfo
```

## Что делать, если ошибка повторяется

1. **Проверьте переменные окружения в Vercel:**
   
   **Основной бот:**
   - `TELEGRAM_BOT_TOKEN` - токен основного бота
   - `TELEGRAM_WEBHOOK_SECRET` - секрет для основного бота
   
   **Бот уведомлений:**
   - `TELEGRAM_NOTIFICATIONS_BOT_TOKEN` - токен бота уведомлений
   - `TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET` - отдельный секрет (рекомендуется)
   - Или использует `TELEGRAM_WEBHOOK_SECRET` как fallback
   
   Все секреты должны быть одинаковыми для всех окружений (Production, Preview, Development)

2. **Проверьте логи, чтобы понять какой бот проблемный:**
   - Новые логи четко указывают: `[Main Bot Webhook]` или `[Notifications Bot Webhook]`
   - Логи показывают, какую переменную окружения использует каждый бот
   - Это поможет точно определить, какой webhook нужно переустановить

3. **Убедитесь, что нет старых webhooks:**
   - Может быть установлен webhook на другой URL
   - Удалите webhook: `https://api.telegram.org/bot<TOKEN>/deleteWebhook`
   - Затем установите заново с правильными параметрами

4. **Проверьте, что используется правильный бот:**
   - Убедитесь, что обращаетесь к правильному боту (основной vs уведомления)
   - Проверьте, что токены ботов в переменных окружения корректны

## Безопасность

После решения проблемы рекомендуется:
1. Удалить endpoint `/api/telegram/admin/reset-webhook` из production
2. Или изменить `ADMIN_PASSWORD` на сложный пароль
3. Документировать, какой секрет используется для каждого бота

