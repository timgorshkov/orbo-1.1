# Инструкция по переустановке Telegram Webhook

## Проблема
Telegram webhook возвращает ошибку `401 Unauthorized - secret token mismatch`, что означает, что webhook был установлен без секретного токена или с другим токеном.

## Решение

### Шаг 1: Проверка переменных окружения

Убедитесь, что в вашем Vercel проекте установлены следующие переменные:

1. **TELEGRAM_BOT_TOKEN** - токен основного бота (orbo_community_bot)
2. **TELEGRAM_NOTIFICATIONS_BOT_TOKEN** - токен бота уведомлений (orbo_assistant_bot)
3. **TELEGRAM_WEBHOOK_SECRET** - секретный токен для webhook (рекомендуется длина 48 символов)
4. **TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET** (опционально) - отдельный секрет для бота уведомлений
5. **ADMIN_PASSWORD** - пароль для доступа к административным endpoint'ам

### Шаг 2: Проверка текущего состояния webhook

Выполните GET запрос к:
```
https://app.orbo.ru/api/telegram/admin/reset-webhook?password=YOUR_ADMIN_PASSWORD
```

Это покажет текущее состояние webhook для обоих ботов.

### Шаг 3: Переустановка webhook

Выполните POST запрос к:
```
https://app.orbo.ru/api/telegram/admin/reset-webhook
```

С телом запроса:
```json
{
  "password": "YOUR_ADMIN_PASSWORD"
}
```

Или для переустановки только одного бота:
```json
{
  "password": "YOUR_ADMIN_PASSWORD",
  "botType": "main"
}
```
или
```json
{
  "password": "YOUR_ADMIN_PASSWORD",
  "botType": "notifications"
}
```

### Примеры вызовов через curl

**Проверка состояния:**
```bash
curl "https://app.orbo.ru/api/telegram/admin/reset-webhook?password=YOUR_ADMIN_PASSWORD"
```

**Переустановка обоих webhook:**
```bash
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}'
```

**Переустановка только основного бота:**
```bash
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD","botType":"main"}'
```

### Шаг 4: Проверка

После переустановки webhook:
1. Отправьте тестовое сообщение в Telegram группу, где установлен бот
2. Проверьте логи Vercel - ошибка `401 Unauthorized` не должна появляться
3. Убедитесь, что события обрабатываются корректно

## Альтернативное решение

Если у вас нет установленного `ADMIN_PASSWORD`, вы можете:

1. Добавить переменную окружения `ADMIN_PASSWORD` в Vercel
2. Перезапустить приложение
3. Выполнить шаги выше

## Генерация безопасного секрета

Для генерации безопасного секретного токена (48 символов) можно использовать:

**Node.js:**
```javascript
require('crypto').randomBytes(24).toString('hex')
```

**Python:**
```python
import secrets
secrets.token_hex(24)
```

**Bash:**
```bash
openssl rand -hex 24
```

## Проверка логов

После переустановки webhook проверьте логи в Vercel. Вы должны увидеть:
```
[Main Bot Webhook] Secret token check: {
  endpoint: '/api/telegram/webhook',
  botType: 'MAIN',
  hasSecret: true,
  receivedMatches: true,  // <-- должно быть true!
  secretLength: 48,
  receivedSecretLength: 48  // <-- не undefined!
}
```

## Важно

- Webhook устанавливается автоматически при использовании endpoint'а
- Секретный токен должен быть одинаковым в переменных окружения и при установке webhook
- После изменения `TELEGRAM_WEBHOOK_SECRET` обязательно переустановите webhook
- Для production используйте длинный случайный секрет (рекомендуется 48+ символов)


