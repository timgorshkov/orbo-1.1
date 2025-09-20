# Настройка аналитики Telegram-групп

## Шаги для настройки и исправления аналитики

1. **Обновите базу данных**

   Выполните следующие SQL-скрипты в Supabase SQL Editor:

   ```sql
   -- Проверьте структуру таблиц
   SELECT EXISTS (
     SELECT FROM information_schema.tables 
     WHERE table_schema = 'public'
     AND table_name = 'group_metrics'
   );

   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'activity_events'
   ORDER BY ordinal_position;
   ```

   Затем выполните скрипт обновления структуры таблиц:
   
   ```sql
   -- Выполните содержимое файла db/update_activity_events.sql
   ```

2. **Обновите переменные окружения**

   Убедитесь, что в Vercel настроены следующие переменные окружения:

   - `TELEGRAM_BOT_TOKEN` - токен основного бота
   - `TELEGRAM_BOT_ID` - ID основного бота
   - `TELEGRAM_WEBHOOK_SECRET` - секретный ключ для webhook
   - `TELEGRAM_NOTIFICATIONS_BOT_TOKEN` (опционально) - токен бота для уведомлений
   - `TELEGRAM_NOTIFICATIONS_BOT_ID` (опционально) - ID бота для уведомлений

3. **Настройте webhook**

   Выполните запрос для настройки webhook:

   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url=https://your-domain.com/api/telegram/webhook&secret_token={TELEGRAM_WEBHOOK_SECRET}
   ```

   Замените `{TELEGRAM_BOT_TOKEN}` и `{TELEGRAM_WEBHOOK_SECRET}` на ваши значения, а `your-domain.com` на домен вашего приложения.

4. **Проверьте настройку webhook**

   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo
   ```

5. **Отключите приватность бота**

   Для сбора всех сообщений в группах, отключите режим приватности бота через @BotFather:
   
   1. Напишите `/setprivacy` боту @BotFather
   2. Выберите вашего бота
   3. Выберите опцию `Disable`

6. **Перезапустите приложение**

   Перезапустите ваше приложение на Vercel, чтобы изменения вступили в силу.

7. **Проверьте логи**

   После перезапуска проверьте логи на наличие ошибок. Убедитесь, что сообщения успешно обрабатываются и метрики обновляются.

## Проверка работы аналитики

1. Отправьте несколько тестовых сообщений в группу с ботом
2. Проверьте, что события записываются в таблицу `activity_events`:

   ```sql
   SELECT * FROM activity_events ORDER BY created_at DESC LIMIT 10;
   ```

3. Проверьте, что метрики обновляются в таблице `group_metrics`:

   ```sql
   SELECT * FROM group_metrics ORDER BY date DESC LIMIT 10;
   ```

4. Проверьте работу команды `/stats` в группе с ботом

## Устранение неполадок

Если аналитика не работает:

1. **Проверьте webhook**
   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo
   ```
   
   Убедитесь, что URL указан правильно и нет ошибок.

2. **Проверьте логи**
   
   Ищите ошибки, связанные с обработкой сообщений или обновлением метрик.

3. **Проверьте структуру таблиц**
   
   Выполните SQL-запросы для проверки структуры таблиц.

4. **Проверьте права бота**
   
   Убедитесь, что бот имеет права администратора в группе.

5. **Проверьте режим приватности**
   
   Убедитесь, что режим приватности отключен через @BotFather.
