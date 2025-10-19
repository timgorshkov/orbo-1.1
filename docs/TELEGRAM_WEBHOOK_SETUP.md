# Настройка Telegram Webhook для отслеживания активности

## Проблема

После использования `@orbo_community_bot` для авторизации перестала подтягиваться активность из Telegram групп.

## Решение

**Важно:** Telegram Login Widget и Webhook - это **разные механизмы**, они НЕ конфликтуют:
- **Login Widget** - OAuth через браузер (для авторизации пользователей)
- **Webhook** - получение обновлений из групп (для отслеживания активности)

Один и тот же бот может использоваться для обоих механизмов одновременно!

---

## Шаг 1: Проверить текущий статус webhook

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

Замените `<YOUR_BOT_TOKEN>` на токен вашего бота.

**Ожидаемый результат (если webhook настроен):**
```json
{
  "ok": true,
  "result": {
    "url": "https://app.orbo.ru/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40
  }
}
```

**Если webhook НЕ настроен:**
```json
{
  "ok": true,
  "result": {
    "url": "",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## Шаг 2: Настроить webhook (если не настроен)

### Вариант A: Через curl

```bash
curl -F "url=https://app.orbo.ru/api/telegram/webhook" \
     -F "secret_token=YOUR_WEBHOOK_SECRET" \
     -F "max_connections=40" \
     -F "drop_pending_updates=false" \
     "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook"
```

### Вариант B: Через браузер

Откройте в браузере:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://app.orbo.ru/api/telegram/webhook&secret_token=YOUR_WEBHOOK_SECRET
```

**Важно:**
- Замените `<YOUR_BOT_TOKEN>` на токен бота
- Замените `app.orbo.ru` на ваш домен (если используете другой)
- `YOUR_WEBHOOK_SECRET` должен совпадать с `TELEGRAM_WEBHOOK_SECRET` в `.env`

**Успешный ответ:**
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

---

## Шаг 3: Проверить переменные окружения

Убедитесь, что в `.env` (локально) и в Vercel Environment Variables есть:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=your_secret_replace_in_production

# Для Login Widget
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=orbo_community_bot
```

### Установка в Vercel:

1. Откройте проект в Vercel Dashboard
2. Settings → Environment Variables
3. Добавьте:
   - `TELEGRAM_BOT_TOKEN` (Production, Preview, Development)
   - `TELEGRAM_WEBHOOK_SECRET` (Production, Preview, Development)
4. Redeploy проекта

---

## Шаг 4: Проверить работу webhook

### 4.1. Отправить тестовое сообщение

Отправьте любое сообщение в Telegram-группу, где добавлен бот.

### 4.2. Проверить логи Vercel

1. Откройте Vercel Dashboard → ваш проект
2. Functions → /api/telegram/webhook
3. Посмотрите логи - должны быть записи:

```
Webhook received: {...}
Processing update with eventProcessingService
```

### 4.3. Проверить данные в БД

```sql
-- Проверить последние события
SELECT * FROM activity_events 
ORDER BY created_at DESC 
LIMIT 10;

-- Проверить статус групп
SELECT id, org_id, title, bot_status, last_sync_at 
FROM telegram_groups 
WHERE bot_status = 'connected';
```

---

## Шаг 5: Устранение типичных проблем

### Проблема: "Webhook не получает обновления"

**Причины:**
1. Webhook URL недоступен (не HTTPS)
2. Неправильный `secret_token`
3. Бот не админ в группе

**Решение:**
```bash
# 1. Проверить доступность endpoint
curl https://app.orbo.ru/api/telegram/webhook

# 2. Удалить и заново установить webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook?drop_pending_updates=true"
curl -F "url=https://app.orbo.ru/api/telegram/webhook" \
     -F "secret_token=YOUR_SECRET" \
     "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook"

# 3. Проверить, что бот админ в группе
# Зайти в группу → Настройки → Администраторы → Должен быть бот
```

### Проблема: "401 Unauthorized в логах"

**Причина:** `TELEGRAM_WEBHOOK_SECRET` в Vercel не совпадает с `secret_token` в webhook.

**Решение:**
1. Проверить переменную в Vercel
2. Обновить webhook с правильным секретом
3. Redeploy проекта

### Проблема: "Бот не реагирует на команды"

**Причина:** Бот не админ группы или webhook не настроен.

**Решение:**
1. Назначить бота администратором группы
2. Дать права: "Управление сообщениями", "Добавление участников"
3. Проверить webhook через `/getWebhookInfo`

---

## Шаг 6: Тестирование активности

### 6.1. Отправить сообщения в группу

1. Отправьте несколько сообщений от разных пользователей
2. Добавьте нового участника
3. Удалите участника

### 6.2. Проверить в админке

1. Откройте `/app/[org]/telegram`
2. Выберите группу
3. Проверьте аналитику:
   - Количество участников должно обновиться
   - График активности должен показывать данные
   - Статистика должна отображаться

---

## Важные замечания

### ✅ Можно одновременно использовать:
- **Login Widget** для авторизации участников
- **Webhook** для отслеживания активности
- **Bot Commands** для команд в группах
- **Notifications** для уведомлений

### ⚠️ Ограничения:
- Один бот = один webhook URL
- Webhook URL должен быть HTTPS
- Timeout обработки webhook - 60 секунд
- Telegram повторяет запрос при ошибках

### 🔒 Безопасность:
- Всегда используйте `secret_token`
- Храните `TELEGRAM_BOT_TOKEN` в секретах
- Проверяйте `x-telegram-bot-api-secret-token` в webhook

---

## Альтернатива: Long Polling (для dev)

Если webhook не работает (например, на localhost):

```bash
# Удалить webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"

# Запустить long polling (в отдельном терминале)
node scripts/telegram-polling.js
```

**Но для продакшена используйте webhook!**

---

## Проверочный чеклист

- [ ] Webhook установлен (`getWebhookInfo` показывает URL)
- [ ] Переменные окружения в Vercel установлены
- [ ] Бот - администратор всех групп
- [ ] Endpoint `/api/telegram/webhook` отвечает 200
- [ ] Логи Vercel показывают входящие webhook'и
- [ ] БД содержит записи в `activity_events`
- [ ] Аналитика в админке обновляется

---

**Дата:** 2025-10-10  
**Статус:** Инструкция готова для применения

