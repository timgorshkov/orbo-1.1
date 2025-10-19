# Автоматическая настройка Telegram Webhook'ов

**Проблема:** После очистки БД или деплоя webhook'и могут быть не настроены, что приводит к ошибкам обработки событий.

**Решение:** Автоматическая проверка и установка webhook'ов для обоих ботов.

---

## ⚡ БЫСТРАЯ НАСТРОЙКА (1 минута)

### Вариант 1: Через браузер

1. Откройте: `https://app.orbo.ru/api/telegram/admin/setup-webhooks`

2. **GET запрос** (просто откройте в браузере):
   - Показывает текущий статус webhook'ов
   - Проверяет оба бота

3. **POST запрос** (через DevTools Console):
   ```javascript
   fetch('/api/telegram/admin/setup-webhooks', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' }
   })
   .then(res => res.json())
   .then(data => console.log('✅ Webhooks configured:', data))
   .catch(err => console.error('❌ Error:', err));
   ```

### Вариант 2: Через curl (из терминала)

```bash
# Проверить статус
curl https://app.orbo.ru/api/telegram/admin/setup-webhooks

# Установить webhook'и
curl -X POST https://app.orbo.ru/api/telegram/admin/setup-webhooks
```

---

## 🔍 Проверка статуса

### Health Check с проверкой webhook'ов

```bash
curl "https://app.orbo.ru/api/healthz?check_webhooks=true"
```

**Ожидаемый ответ (всё OK):**
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T...",
  "checks": {
    "database": "ok",
    "env_vars": {
      "status": "ok",
      "all_present": true
    },
    "webhooks": {
      "status": "configured",
      "main_bot": "ok",
      "assistant_bot": "ok"
    }
  }
}
```

**Если webhook'и не настроены:**
```json
{
  "status": "degraded",
  "checks": {
    "webhooks": {
      "status": "needs_setup",
      "main_bot": "not_configured",
      "assistant_bot": "not_configured"
    }
  },
  "warnings": [
    "Telegram webhooks are not properly configured",
    "Fix by calling: POST https://app.orbo.ru/api/telegram/admin/setup-webhooks"
  ]
}
```

---

## 🤖 Что настраивается автоматически

### Main Bot (`orbo_community_bot`)

- **URL:** `https://app.orbo.ru/api/telegram/webhook`
- **Secret Token:** из `TELEGRAM_WEBHOOK_SECRET`
- **Allowed Updates:** `message`, `chat_member`, `my_chat_member`
- **Max Connections:** 40

**Обрабатывает:**
- Сообщения в группах
- Добавление/удаление участников
- Изменение статуса бота в чате

### Assistant Bot (`orbo_assistant_bot`)

- **URL:** `https://app.orbo.ru/api/telegram/notifications/webhook`
- **Secret Token:** из `TELEGRAM_WEBHOOK_SECRET`
- **Allowed Updates:** `message`
- **Max Connections:** 40

**Обрабатывает:**
- Команды `/start` и `/help` в личных чатах
- Проверка Telegram User ID для верификации

---

## 🔧 Детальная диагностика

### Проверка конкретного бота

```bash
# Main bot
curl "https://api.telegram.org/bot<MAIN_BOT_TOKEN>/getWebhookInfo"

# Assistant bot
curl "https://api.telegram.org/bot<ASSISTANT_BOT_TOKEN>/getWebhookInfo"
```

**Правильный ответ:**
```json
{
  "ok": true,
  "result": {
    "url": "https://app.orbo.ru/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40,
    "allowed_updates": ["message", "chat_member", "my_chat_member"]
  }
}
```

### Если есть ошибки

**Проблема: `last_error_message` в ответе**

```json
{
  "last_error_date": 1234567890,
  "last_error_message": "Wrong response from the webhook: 401 Unauthorized"
}
```

**Решение:** Проверьте `TELEGRAM_WEBHOOK_SECRET` в переменных окружения.

**Проблема: `pending_update_count` > 0**

Есть необработанные обновления.

**Решение:**
```bash
# Очистить очередь
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.orbo.ru/api/telegram/webhook",
    "secret_token": "<WEBHOOK_SECRET>",
    "drop_pending_updates": true
  }'
```

---

## 🚀 Автоматизация после деплоя

### Vercel Deploy Hook (рекомендуется)

Создайте GitHub Action, который вызывает настройку webhook'ов после успешного деплоя:

```yaml
# .github/workflows/post-deploy.yml
name: Post-Deploy Setup

on:
  deployment_status:

jobs:
  setup-webhooks:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Setup Telegram Webhooks
        run: |
          curl -X POST https://app.orbo.ru/api/telegram/admin/setup-webhooks
```

### Ручная проверка после деплоя

После каждого деплоя выполните:

```bash
# 1. Проверьте health
curl "https://app.orbo.ru/api/healthz?check_webhooks=true"

# 2. Если webhook'и не настроены - установите
curl -X POST https://app.orbo.ru/api/telegram/admin/setup-webhooks

# 3. Проверьте снова
curl "https://app.orbo.ru/api/healthz?check_webhooks=true"
```

### Uptime Monitor

Добавьте `https://app.orbo.ru/api/healthz?check_webhooks=true` в ваш uptime monitor (например, UptimeRobot, Pingdom).

Если статус не `"ok"` - отправляйте уведомление.

---

## 📋 Чек-лист настройки

- [ ] `TELEGRAM_WEBHOOK_SECRET` установлен в переменных окружения
- [ ] `TELEGRAM_BOT_TOKEN_MAIN` установлен
- [ ] `TELEGRAM_BOT_TOKEN_ASSISTANT` установлен
- [ ] Выполнен POST к `/api/telegram/admin/setup-webhooks`
- [ ] Health check возвращает `status: "ok"`
- [ ] Main bot webhook URL правильный
- [ ] Assistant bot webhook URL правильный
- [ ] `pending_update_count` = 0 для обоих ботов
- [ ] Нет `last_error_message` в getWebhookInfo

---

## 🐛 Troubleshooting

### Ошибка: "secret token mismatch"

**Причина:** Webhook настроен с другим secret токеном.

**Решение:**
```bash
# Перенастройте webhook с правильным токеном
curl -X POST https://app.orbo.ru/api/telegram/admin/setup-webhooks
```

### Ошибка: "TELEGRAM_WEBHOOK_SECRET not configured"

**Причина:** Переменная окружения не установлена.

**Решение:**
1. Vercel Dashboard → Settings → Environment Variables
2. Добавьте `TELEGRAM_WEBHOOK_SECRET` (48 символов, случайная строка)
3. Redeploy

### Webhook'и не обрабатываются

**Проверка:**
1. Отправьте сообщение в группу с ботом
2. Проверьте Vercel логи - должны быть записи `[Main Bot Webhook]`
3. Если записей нет - webhook не работает

**Решение:**
```bash
# 1. Проверьте статус
curl https://app.orbo.ru/api/telegram/admin/setup-webhooks

# 2. Перенастройте
curl -X POST https://app.orbo.ru/api/telegram/admin/setup-webhooks

# 3. Отправьте тестовое сообщение в группу
# 4. Проверьте логи Vercel
```

---

## 📊 Мониторинг

### Автоматический мониторинг в коде

Добавьте в ваш CI/CD:

```bash
#!/bin/bash
# scripts/check-webhooks.sh

HEALTH=$(curl -s "https://app.orbo.ru/api/healthz?check_webhooks=true")
STATUS=$(echo $HEALTH | jq -r '.checks.webhooks.status')

if [ "$STATUS" != "configured" ]; then
  echo "❌ Webhooks not configured! Setting up..."
  curl -X POST https://app.orbo.ru/api/telegram/admin/setup-webhooks
  
  # Проверяем снова
  sleep 2
  HEALTH=$(curl -s "https://app.orbo.ru/api/healthz?check_webhooks=true")
  STATUS=$(echo $HEALTH | jq -r '.checks.webhooks.status')
  
  if [ "$STATUS" = "configured" ]; then
    echo "✅ Webhooks successfully configured"
  else
    echo "❌ Failed to configure webhooks"
    exit 1
  fi
else
  echo "✅ Webhooks already configured"
fi
```

---

## ✅ После настройки

1. **Проверьте health:**
   ```bash
   curl "https://app.orbo.ru/api/healthz?check_webhooks=true"
   ```
   
2. **Отправьте тестовое сообщение в группу**

3. **Проверьте Vercel логи** - должны быть записи об обработке

4. **Обновите страницу "Доступные группы"** - группы должны появиться!

---

**Статус:** ✅ Автоматическая настройка webhook'ов готова  
**API Endpoints:**
- GET/POST `/api/telegram/admin/setup-webhooks` - настройка
- GET `/api/healthz?check_webhooks=true` - проверка

**Следующий шаг:** Выполните POST к `/api/telegram/admin/setup-webhooks` прямо сейчас!

