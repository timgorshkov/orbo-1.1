# Инструкция по настройке базы данных Supabase

## Шаг 1: Создание таблиц и функций

1. Откройте проект в [Supabase Dashboard](https://app.supabase.com/)
2. Перейдите в раздел "SQL Editor" (левое меню)
3. Создайте новый запрос (New query)
4. Скопируйте содержимое файла `db/deploy.sql` в редактор
5. Выполните запрос (кнопка "Run")

## Шаг 2: Создание функции для выполнения SQL-скриптов

1. Оставаясь в "SQL Editor", создайте новый запрос
2. Скопируйте содержимое файла `db/exec_sql_function.sql` в редактор
3. Выполните запрос (кнопка "Run")

## Шаг 3: Создание Storage bucket для материалов

1. Перейдите в раздел "Storage" (левое меню)
2. Нажмите кнопку "Create bucket"
3. Укажите имя "materials"
4. Снимите галочку с "Public bucket" (хранилище не должно быть публичным)
5. Нажмите "Create bucket"

## Шаг 4: Настройка политик безопасности для Storage

1. Вернитесь в раздел "SQL Editor"
2. Создайте новый запрос
3. Скопируйте содержимое файла `db/bucket_policies.sql` в редактор
4. Выполните запрос

## Шаг 5: Загрузка демо-данных (опционально)

1. Перед загрузкой демо-данных, проверьте свой User ID:
   - Перейдите в раздел "Authentication" -> "Users"
   - Найдите своего пользователя и скопируйте его UUID
2. Откройте файл `db/demo_data.sql` и замените все вхождения `YOUR_USER_ID_HERE` на ваш User ID
3. В "SQL Editor" создайте новый запрос
4. Скопируйте отредактированный файл `db/demo_data.sql` в редактор
5. Выполните запрос

## Проверка успешной установки

1. В "SQL Editor" выполните запрос:
   ```sql
   SELECT * FROM public.organizations;
   ```
2. Если вы видите список организаций (или пустую таблицу, если не загружали демо-данные), значит схема базы данных установлена корректно.

## Разрешить аутентификацию по Email

1. Перейдите в раздел "Authentication" -> "Providers"
2. Включите провайдер "Email"
3. Настройте параметры (можно оставить по умолчанию)
4. Сохраните настройки

## Настройка редиректов при аутентификации

1. Перейдите в раздел "Authentication" -> "URL Configuration"
2. Добавьте в поле "Site URL" адрес вашего сайта (например: `https://your-app.vercel.app`)
3. Добавьте в "Redirect URLs" следующие адреса:
   - `https://your-app.vercel.app/`
   - `https://your-app.vercel.app/app`
   - `http://localhost:3000/` (для локальной разработки)
   
## Дополнительные настройки для деплоя на Vercel

После того как вы задеплоите приложение на Vercel, добавьте переменные окружения:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
JWT_SECRET=your-secret-key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Не забудьте заменить значения на реальные данные из вашего проекта Supabase.

## Telegram-бот (для полного функционала)

1. Создайте бота через [BotFather](https://t.me/BotFather)
2. Получите токен бота
3. Добавьте токен в переменные окружения на Vercel:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_WEBHOOK_SECRET=your-secret-token
   TELEGRAM_WEBHOOK_URL=https://your-app.vercel.app/api/telegram/webhook
   ```
4. После деплоя настройте webhook для бота:
   ```
   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url={TELEGRAM_WEBHOOK_URL}&secret_token={TELEGRAM_WEBHOOK_SECRET}
   ```
