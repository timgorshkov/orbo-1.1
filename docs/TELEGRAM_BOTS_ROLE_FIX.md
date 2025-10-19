# Разделение ролей Telegram-ботов

## Проблема

Ранее оба бота отправляли User ID пользователям, что создавало путаницу:
- **orbo_community_bot** отправлял User ID при `/start` в личных сообщениях
- **orbo_assistant_bot** не отправлял User ID
- В инструкциях упоминался @orbo_assistant_bot, но ID приходил от другого бота

## Решение

Разделены роли ботов согласно их назначению:

### 🤖 orbo_assistant_bot (notifications bot)
**Назначение:** Прямая коммуникация с пользователями

**Функции:**
- ✅ Отправка User ID при `/start`
- ✅ Отправка кодов верификации
- ✅ Отправка уведомлений о событиях
- ✅ Справка по верификации `/help`

**Команды:**
- `/start` - получить User ID и инструкции по верификации
- `/help` - показать справку с User ID

### 🤖 orbo_community_bot (main bot)
**Назначение:** Работа с группами

**Функции:**
- ✅ Добавляется в Telegram-группы
- ✅ Отслеживает события в группах (новые участники, сообщения, реакции)
- ✅ Обрабатывает коды авторизации в личных сообщениях
- ✅ Перенаправляет на @orbo_assistant_bot для верификации

**Команды в личных сообщениях:**
- `/start`, `/help` - перенаправление на @orbo_assistant_bot

**Команды в группах:**
- Обработка событий группы

## Внесённые изменения

### 1. app/api/telegram/notifications/webhook/route.ts
**Изменения в orbo_assistant_bot:**

- ✅ Убрана проверка на существование participant
- ✅ Добавлена отправка User ID при `/start`
- ✅ Добавлена подробная справка с User ID при `/help`
- ✅ Добавлена проверка на ожидающие коды верификации
- ✅ Убрано логирование activity_events (не требует participant)

**Новое сообщение `/start`:**
```
👋 Привет, {имя}!

🤖 Orbo Assistant Bot

Ваш Telegram User ID: `{id}`

📋 Следующие шаги:
1. Скопируйте ваш User ID выше
2. Перейдите в веб-интерфейс Orbo
3. Откройте "Настройка Telegram аккаунта"
4. Вставьте ваш User ID
5. Нажмите "Сохранить и отправить код верификации"
6. Вы получите код верификации здесь
7. Введите код в веб-интерфейсе
```

### 2. app/api/telegram/webhook/route.ts
**Изменения в orbo_community_bot:**

- ✅ Убрана отправка User ID в личных сообщениях
- ✅ Добавлено перенаправление на @orbo_assistant_bot

**Новое сообщение `/start` и `/help`:**
```
🤖 Orbo Community Bot

Этот бот используется для работы с Telegram-группами.

Для получения вашего User ID и верификации аккаунта используйте:
👉 @orbo_assistant_bot

Откройте @orbo_assistant_bot и нажмите /start
```

### 3. Инструкции в интерфейсе
**Проверены и подтверждены правильные упоминания:**

- ✅ `app/app/[org]/telegram/account/page.tsx` - везде @orbo_assistant_bot
- ✅ `app/app/[org]/telegram/setup-telegram/page.tsx` - везде @orbo_assistant_bot

## Пользовательский сценарий

### Верификация Telegram-аккаунта владельца:

1. Пользователь открывает веб-интерфейс Orbo
2. Переходит в "Настройка Telegram аккаунта"
3. Видит инструкцию открыть **@orbo_assistant_bot** ✅
4. Открывает @orbo_assistant_bot в Telegram
5. Нажимает `/start`
6. Бот отправляет User ID ✅
7. Пользователь копирует ID и вставляет в веб-форму
8. Нажимает "Сохранить и отправить код"
9. Код приходит от **@orbo_assistant_bot** ✅
10. Пользователь вводит код и верифицируется

### Если пользователь по ошибке открыл @orbo_community_bot:

1. Пользователь открывает @orbo_community_bot
2. Нажимает `/start`
3. Бот отправляет сообщение с перенаправлением на @orbo_assistant_bot ✅
4. Пользователь переходит к правильному боту

## Преимущества

✅ **Понятное разделение ролей** - каждый бот отвечает за свою область
✅ **Нет путаницы** - User ID приходит от того бота, который упомянут в инструкциях
✅ **Простота поддержки** - логика каждого бота изолирована
✅ **Правильные ожидания** - пользователь знает, для чего нужен каждый бот

## Технические детали

### Webhook endpoints:
- `/api/telegram/webhook` - orbo_community_bot (группы)
- `/api/telegram/notifications/webhook` - orbo_assistant_bot (уведомления)

### Environment variables:
- `TELEGRAM_BOT_TOKEN` - токен orbo_community_bot
- `TELEGRAM_NOTIFICATIONS_BOT_TOKEN` - токен orbo_assistant_bot
- `TELEGRAM_WEBHOOK_SECRET` - секрет для orbo_community_bot
- `TELEGRAM_NOTIFICATIONS_WEBHOOK_SECRET` - секрет для orbo_assistant_bot

## Следующие шаги

1. ✅ Изменения внесены в код
2. ⏳ Нужно протестировать оба сценария:
   - Верификация через @orbo_assistant_bot
   - Перенаправление от @orbo_community_bot
3. ⏳ Убедиться, что webhook'и настроены правильно для обоих ботов

## Команды для сброса webhook'ов (если потребуется)

```bash
# Сброс webhook для notifications bot
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{"botType": "notifications"}'

# Сброс webhook для main bot
curl -X POST https://app.orbo.ru/api/telegram/admin/reset-webhook \
  -H "Content-Type: application/json" \
  -d '{"botType": "main"}'
```


