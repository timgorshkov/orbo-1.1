# Миграция на домен app.orbo.ru - Инструкции для выполнения

## ✅ Завершено: Обновление кода

Все файлы кода и документации обновлены на новый домен `app.orbo.ru`.

---

## 🔧 ЧТО ВАМ НУЖНО СДЕЛАТЬ СЕЙЧАС

### 1. Обновить переменную окружения в Vercel (КРИТИЧНО!)

1. Откройте: https://vercel.com/your-team/orbo-1-1/settings/environment-variables
2. Найдите переменную `NEXT_PUBLIC_APP_URL`
3. Обновите значение на: `https://app.orbo.ru`
4. Убедитесь, что значение установлено для **всех окружений**:
   - ✅ Production
   - ✅ Preview  
   - ✅ Development

5. **Сохраните** изменения

6. **ВАЖНО:** Сделайте Redeploy проекта:
   - Перейдите на вкладку Deployments
   - Нажмите на три точки у последнего deployment
   - Выберите "Redeploy"
   - Дождитесь завершения деплоя

---

### 2. Переустановить Webhooks для Telegram ботов (КРИТИЧНО!)

#### Основной бот (@orbo_assistant_bot или ваш основной бот):

**Откройте в браузере** (замените `<TELEGRAM_BOT_TOKEN>` и `<TELEGRAM_WEBHOOK_SECRET>` на реальные значения из Vercel):

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://app.orbo.ru/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&drop_pending_updates=true
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

#### Бот уведомлений (если используется отдельный):

**Откройте в браузере**:

```
https://api.telegram.org/bot<TELEGRAM_NOTIFICATIONS_BOT_TOKEN>/setWebhook?url=https://app.orbo.ru/api/telegram/notifications/webhook&secret_token=<TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET>&drop_pending_updates=true
```

**Проверка webhooks:**

Основной бот:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

Бот уведомлений:
```
https://api.telegram.org/bot<TELEGRAM_NOTIFICATIONS_BOT_TOKEN>/getWebhookInfo
```

Оба должны показать:
```json
{
  "ok": true,
  "result": {
    "url": "https://app.orbo.ru/api/telegram/...",
    "pending_update_count": 0
  }
}
```

---

### 3. Настроить домен в @BotFather (КРИТИЧНО для авторизации!)

Это необходимо для работы Telegram Login Widget.

**Для каждого бота:**

1. Откройте Telegram и найдите @BotFather
2. Отправьте команду: `/setdomain`
3. Выберите вашего бота из списка
4. Введите: `app.orbo.ru` (без https:// и без www)
5. Подтвердите

**Проверьте для:**
- ✅ Основного бота (тот, через который идет авторизация)
- ✅ Бота уведомлений (если используется)

---

### 4. Обновить Redirect URLs в Supabase

1. Откройте Supabase Dashboard: https://app.supabase.com
2. Выберите ваш проект
3. Перейдите в: **Authentication** → **URL Configuration**

4. **Site URL:** `https://app.orbo.ru`

5. **Redirect URLs** (добавьте следующие):
   ```
   https://app.orbo.ru/**
   https://app.orbo.ru/auth-callback
   https://app.orbo.ru/auth/telegram
   http://localhost:3000/** (для локальной разработки)
   ```

6. Сохраните изменения

---

## ✅ ПРОВЕРКА ПОСЛЕ МИГРАЦИИ

### Шаг 1: Проверка основного сайта
1. Откройте: https://app.orbo.ru
2. Убедитесь, что сайт загружается
3. Проверьте, что нет ошибок в консоли браузера

### Шаг 2: Проверка webhooks
Откройте: https://app.orbo.ru/api/telegram/admin/check-webhook?password=check

Вы должны увидеть:
```json
{
  "mainBot": {
    "url": "https://app.orbo.ru/api/telegram/webhook",
    "urlMatches": true
  },
  "notificationsBot": {
    "url": "https://app.orbo.ru/api/telegram/notifications/webhook",
    "urlMatches": true
  }
}
```

### Шаг 3: Проверка авторизации
1. Откройте страницу авторизации: https://app.orbo.ru
2. Попробуйте авторизоваться через Email
3. Попробуйте авторизоваться через Telegram (если настроено)

### Шаг 4: Проверка Telegram бота
1. Откройте Telegram
2. Найдите вашего бота
3. Отправьте команду `/start`
4. Бот должен ответить с вашим User ID

### Шаг 5: Проверка логов Vercel
1. Откройте: https://vercel.com/your-team/orbo-1-1/logs
2. Убедитесь, что нет ошибок типа:
   - ❌ "Unauthorized - secret token mismatch"
   - ❌ "Wrong response from the webhook"
3. Все webhook запросы должны возвращать 200 OK

### Шаг 6: Проверка создания события
1. Войдите в приложение
2. Создайте тестовое событие
3. Опубликуйте его
4. Проверьте, что уведомление пришло в Telegram группу (если настроено)

---

## 🚨 ЧТО ДЕЛАТЬ ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ

### Проблема: Сайт не открывается
- Проверьте, что домен правильно настроен в Vercel
- Проверьте DNS настройки домена app.orbo.ru
- Подождите 5-10 минут для распространения DNS

### Проблема: Ошибки 401 в логах
- Убедитесь, что webhooks переустановлены
- Проверьте, что секреты в Vercel совпадают с теми, что использовались при установке webhooks
- Попробуйте удалить и установить webhooks заново

### Проблема: Telegram Login не работает
- Убедитесь, что домен настроен в @BotFather через `/setdomain`
- Проверьте, что используется правильный домен: `app.orbo.ru` (без https://)
- Проверьте Redirect URLs в Supabase

### Проблема: Бот не отвечает
- Проверьте webhook info: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Убедитесь, что URL правильный: `https://app.orbo.ru/api/telegram/webhook`
- Проверьте, что `pending_update_count` = 0

---

## 📞 НУЖНА ПОМОЩЬ?

Если что-то пошло не так:
1. Проверьте логи Vercel
2. Используйте диагностический endpoint: https://app.orbo.ru/api/telegram/admin/check-webhook?password=check
3. Откатитесь назад, изменив `NEXT_PUBLIC_APP_URL` на старое значение и переустановив webhooks

---

## ✅ ЧЕКЛИСТ МИГРАЦИИ

- [ ] Обновлена переменная `NEXT_PUBLIC_APP_URL` в Vercel
- [ ] Сделан Redeploy проекта в Vercel
- [ ] Переустановлен webhook основного бота
- [ ] Переустановлен webhook бота уведомлений (если есть)
- [ ] Настроен домен в @BotFather для основного бота
- [ ] Настроен домен в @BotFather для бота уведомлений (если есть)
- [ ] Обновлены Redirect URLs в Supabase
- [ ] Проверен доступ к сайту
- [ ] Проверены webhooks через check-webhook endpoint
- [ ] Проверена авторизация через Email
- [ ] Проверена авторизация через Telegram
- [ ] Проверена работа бота (команда /start)
- [ ] Проверены логи Vercel (нет ошибок)
- [ ] Проверено создание и публикация события

---

## 🎉 ГОТОВО!

После выполнения всех шагов ваше приложение полностью мигрировано на домен `app.orbo.ru`.

Старый домен `orbo-1-1.vercel.app` будет автоматически редиректить на новый домен через Vercel.

