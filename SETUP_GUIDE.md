# Руководство по настройке Telegram-авторизации

## 📋 Список задач для запуска

### 1. Применить миграцию БД ✅
```bash
node db/init.js db/migrations/23_organization_invites.sql
```

### 2. Настроить бота в Telegram

#### Важно: Можно использовать существующий бот!
Для Telegram Login Widget можно использовать уже существующий бот, например `@orbo_community_bot` или `@orbo_assistant_bot`. Это **не помешает** его текущей работе с группами.

#### Шаг 1: Настроить домен для Login Widget
```
1. В @BotFather отправить /setdomain
2. Выбрать ваш бот (@orbo_community_bot)
3. Ввести ваш домен (например: yourapp.com или localhost для теста)
```

#### Шаг 2: Получить токен (если ещё не получен)
```
1. В @BotFather отправить /token
2. Выбрать @orbo_community_bot
3. Сохранить BOT_TOKEN
```

**Рекомендация:** Используйте `@orbo_community_bot` - название лучше подходит для сообщества пользователей.

**Важно:** Для локальной разработки можно использовать `localhost`, но для продакшена нужен реальный домен с HTTPS.

### 3. Настроить переменные окружения

Создайте `.env.local` (или обновите существующий):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000  # для dev
# NEXT_PUBLIC_APP_URL=https://yourapp.com  # для prod

# Telegram Bot
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_name  # БЕЗ @
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=your_secret_replace_in_production
```

### 4. Перезапустить dev-сервер
```bash
npm run dev
```

### 5. Протестировать

#### Тест 1: Создание приглашения
```
1. Войти как admin/owner
2. Перейти на /app/[org]/settings/invites
3. Создать приглашение
4. Скопировать ссылку
```

#### Тест 2: Использование приглашения
```
1. Открыть ссылку в режиме инкогнито
2. Нажать "Войти через Telegram"
3. Подтвердить в Telegram
4. Проверить, что участник попал в организацию
```

#### Тест 3: Публичное событие
```
1. Создать публичное событие
2. Открыть ссылку /p/[org]/events/[id]
3. Нажать "Зарегистрироваться"
4. Войти через Telegram в модальном окне
5. Проверить регистрацию
```

## 🚨 Возможные проблемы и решения

### Проблема: Widget не отображается
**Причина:** Домен не настроен в BotFather  
**Решение:** Выполнить `/setdomain` в @BotFather

### Проблема: "Invalid Telegram authentication"
**Причина:** Неверный BOT_TOKEN  
**Решение:** Проверить токен в .env.local

### Проблема: "No access to organization"
**Причина:** Пользователь не в Telegram-группах и нет валидного invite  
**Решение:** Использовать ссылку-приглашение

### Проблема: ERR_BLOCKED_BY_CLIENT (AdBlock)
**Причина:** Блокировщик рекламы блокирует telegram-widget.js  
**Решение:** Отключить AdBlock для вашего домена

## 📦 Созданные файлы

### Миграция БД
- `db/migrations/23_organization_invites.sql`

### Компоненты
- `components/auth/telegram-login.tsx` - Telegram Widget
- `components/settings/invites-manager.tsx` - UI управления

### API Endpoints
- `app/api/auth/telegram/route.ts` - OAuth авторизация
- `app/api/organizations/[id]/invites/route.ts` - CRUD приглашений
- `app/api/organizations/[id]/invites/[inviteId]/route.ts` - Управление

### Страницы
- `app/join/[org]/[token]/page.tsx` - Приглашения (server)
- `app/join/[org]/[token]/client.tsx` - Приглашения (client)
- `app/login/telegram/page.tsx` - Логин через Telegram
- `app/app/[org]/settings/invites/page.tsx` - Управление приглашениями

### Обновлённые файлы
- `components/events/public-event-detail.tsx` - Добавлена Telegram-авторизация

### Документация
- `MEMBER_AUTH_DESIGN.md` - Дизайн системы
- `TELEGRAM_AUTH_COMPLETE.md` - Полная документация
- `TELEGRAM_AUTH_STATUS.md` - Статус реализации
- `SETUP_GUIDE.md` - Этот файл

## 🎯 Следующие шаги

### Обязательно перед продакшеном:
1. [ ] Настроить реальный домен в BotFather
2. [ ] Обновить NEXT_PUBLIC_APP_URL на продакшен URL
3. [ ] Сгенерировать secure TELEGRAM_WEBHOOK_SECRET
4. [ ] Протестировать на всех устройствах (Desktop, iOS, Android)
5. [ ] Настроить мониторинг использования приглашений

### Опционально:
1. [ ] Создать страницу /help с инструкциями
2. [ ] Добавить email-уведомления о новых участниках
3. [ ] Настроить аналитику конверсии

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи сервера (`npm run dev`)
2. Проверьте Network tab в браузере
3. Проверьте настройки бота в @BotFather
4. Убедитесь, что все переменные окружения установлены

## 🎉 Готово!

После выполнения всех шагов у вас будет:
- ✅ Telegram-авторизация для участников
- ✅ Система приглашений с гибкими настройками
- ✅ Регистрация на публичные события через Telegram
- ✅ Автоматическая связка с Telegram-группами
- ✅ UI управления приглашениями для админов

---

**Дата создания:** 2025-10-09  
**Версия:** 1.0

