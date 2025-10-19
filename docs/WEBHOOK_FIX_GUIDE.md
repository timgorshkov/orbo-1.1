# 🔧 Исправление Webhook Secret Mismatch

## Проблема
Webhook был установлен с другим секретом, чем тот, что сейчас в `TELEGRAM_WEBHOOK_SECRET`.

## Решение

### Вариант 1: Через PowerShell (Windows)

```powershell
# 1. Установите переменные
$BOT_TOKEN = "ваш_TELEGRAM_BOT_TOKEN"
$WEBHOOK_SECRET = "ваш_TELEGRAM_WEBHOOK_SECRET"
$WEBHOOK_URL = "https://app.orbo.ru/api/telegram/webhook"

# 2. Удалите старый webhook
$deleteUrl = "https://api.telegram.org/bot$BOT_TOKEN/deleteWebhook"
Invoke-RestMethod -Uri $deleteUrl -Method Post
Write-Host "✅ Старый webhook удален"

# 3. Установите новый webhook с секретом
$setUrl = "https://api.telegram.org/bot$BOT_TOKEN/setWebhook"
$body = @{
    url = $WEBHOOK_URL
    secret_token = $WEBHOOK_SECRET
    allowed_updates = @("message", "chat_member", "my_chat_member")
} | ConvertTo-Json

Invoke-RestMethod -Uri $setUrl -Method Post -Body $body -ContentType "application/json"
Write-Host "✅ Новый webhook установлен"

# 4. Проверьте
$infoUrl = "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
Invoke-RestMethod -Uri $infoUrl | ConvertTo-Json -Depth 10
```

### Вариант 2: Через браузер (самый простой)

1. **Получите значения из Vercel:**
   - Откройте: https://vercel.com/your-project/settings/environment-variables
   - Скопируйте `TELEGRAM_BOT_TOKEN`
   - Скопируйте `TELEGRAM_WEBHOOK_SECRET`

2. **Удалите старый webhook:**
   
   Откройте в браузере (замените `YOUR_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_TOKEN/deleteWebhook
   ```

3. **Установите новый webhook:**
   
   Откройте в браузере (замените значения):
   ```
   https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://app.orbo.ru/api/telegram/webhook&secret_token=YOUR_SECRET
   ```

4. **Проверьте:**
   ```
   https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo
   ```

### Вариант 3: Через Postman/Thunder Client

**DELETE Webhook:**
```
POST https://api.telegram.org/bot{YOUR_TOKEN}/deleteWebhook
```

**SET Webhook:**
```
POST https://api.telegram.org/bot{YOUR_TOKEN}/setWebhook
Content-Type: application/json

{
  "url": "https://app.orbo.ru/api/telegram/webhook",
  "secret_token": "YOUR_SECRET",
  "allowed_updates": ["message", "chat_member", "my_chat_member"]
}
```

## Проверка успешности

После выполнения в `/getWebhookInfo` должно быть:
```json
{
  "url": "https://app.orbo.ru/api/telegram/webhook",
  "has_custom_certificate": false,
  "pending_update_count": 0
}
```

## После исправления

Попробуйте снова:
1. Отправить код боту
2. Бот должен ответить ссылкой
3. Перейти по ссылке и авторизоваться





