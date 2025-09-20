# Настройка аналитики Telegram-групп

## Шаги для настройки и исправления аналитики

1. **Обновите базу данных**

   Выполните следующий SQL-скрипт в Supabase SQL Editor для создания необходимых таблиц:

   ```sql
   -- Создаем таблицу для хранения обработанных Telegram-обновлений (идемпотентность)
   CREATE TABLE IF NOT EXISTS telegram_updates (
     id SERIAL PRIMARY KEY,
     update_id BIGINT UNIQUE NOT NULL,
     processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Таблица для хранения событий активности
   CREATE TABLE IF NOT EXISTS activity_events (
     id SERIAL PRIMARY KEY,
     org_id UUID NOT NULL REFERENCES organizations(id),
     event_type TEXT NOT NULL,
     participant_id UUID REFERENCES participants(id),
     tg_user_id BIGINT,
     tg_chat_id BIGINT NOT NULL,
     message_id BIGINT,
     message_thread_id BIGINT,
     reply_to_message_id BIGINT,
     has_media BOOLEAN DEFAULT FALSE,
     chars_count INTEGER,
     links_count INTEGER DEFAULT 0,
     mentions_count INTEGER DEFAULT 0,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     meta JSONB
   );

   -- Индексы для быстрых агрегаций
   CREATE INDEX IF NOT EXISTS idx_activity_org_type_date ON activity_events(org_id, event_type, created_at);
   CREATE INDEX IF NOT EXISTS idx_activity_participant ON activity_events(participant_id, created_at);
   CREATE INDEX IF NOT EXISTS idx_activity_chat_date ON activity_events(tg_chat_id, created_at);
   CREATE INDEX IF NOT EXISTS idx_activity_tg_user_id ON activity_events(tg_user_id);

   -- Таблица для хранения агрегированных метрик по группам
   CREATE TABLE IF NOT EXISTS group_metrics (
     id SERIAL PRIMARY KEY,
     org_id UUID NOT NULL REFERENCES organizations(id),
     tg_chat_id BIGINT NOT NULL,
     date DATE NOT NULL,
     dau INTEGER DEFAULT 0,
     message_count INTEGER DEFAULT 0,
     reply_count INTEGER DEFAULT 0,
     reply_ratio NUMERIC(5,2) DEFAULT 0,
     join_count INTEGER DEFAULT 0,
     leave_count INTEGER DEFAULT 0,
     net_member_change INTEGER DEFAULT 0,
     silent_rate NUMERIC(5,2) DEFAULT 0,
     UNIQUE(org_id, tg_chat_id, date)
   );
   ```

   Затем выполните скрипт для проверки и обновления типов данных:
   
   ```sql
   -- Проверяем и обновляем типы данных для tg_chat_id в telegram_groups
   DO $$
   DECLARE
     column_type TEXT;
   BEGIN
     SELECT data_type INTO column_type
     FROM information_schema.columns
     WHERE table_name = 'telegram_groups' AND column_name = 'tg_chat_id';
     
     IF column_type = 'text' THEN
       RAISE NOTICE 'tg_chat_id in telegram_groups is text, converting to bigint';
       
       -- Создаем временную колонку
       ALTER TABLE telegram_groups ADD COLUMN tg_chat_id_new BIGINT;
       
       -- Копируем данные с преобразованием
       UPDATE telegram_groups SET tg_chat_id_new = tg_chat_id::bigint;
       
       -- Удаляем старую колонку и переименовываем новую
       ALTER TABLE telegram_groups DROP COLUMN tg_chat_id;
       ALTER TABLE telegram_groups RENAME COLUMN tg_chat_id_new TO tg_chat_id;
       
       RAISE NOTICE 'Converted tg_chat_id to bigint';
     ELSE
       RAISE NOTICE 'tg_chat_id in telegram_groups is already %', column_type;
     END IF;
   END
   $$;
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
