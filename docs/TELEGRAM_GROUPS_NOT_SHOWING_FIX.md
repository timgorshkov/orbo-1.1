# Fix: Не отображаются доступные Telegram группы

**Проблема:** После очистки БД и привязки Telegram аккаунта список "Доступные Telegram группы" пуст, хотя бот добавлен в 4 группы.

**Причина:** После очистки БД удалились все записи из `telegram_groups` и `telegram_group_admins`. Система не знает о ваших группах.

---

## 🔍 Шаг 1: Диагностика (1 минута)

Выполните в **Supabase SQL Editor**:

```sql
-- Скопируйте весь код из db/CHECK_TELEGRAM_GROUPS.sql
-- Или используйте этот быстрый запрос:

SELECT 
  'telegram_groups' as table_name, 
  COUNT(*) as count 
FROM telegram_groups
UNION ALL
SELECT 'telegram_group_admins', COUNT(*) FROM telegram_group_admins
UNION ALL
SELECT 'user_telegram_accounts (verified)', COUNT(*) 
FROM user_telegram_accounts WHERE is_verified = true;
```

**Ожидаемый результат:**
- `telegram_groups`: 0 (проблема!)
- `telegram_group_admins`: 0 (проблема!)
- `user_telegram_accounts`: 1 (ваш аккаунт)

---

## ⚡ Шаг 2: Решение - Обновление прав администратора

### Вариант A: Через интерфейс (рекомендуется)

1. **Откройте** `https://app.orbo.ru/app/[YOUR_ORG_ID]/telegram/account`
   - Замените `[YOUR_ORG_ID]` на ID вашей организации

2. **Найдите кнопку** "Обновить права администраторов"

3. **Нажмите** и дождитесь завершения

**Что произойдёт:**
- Бот запросит список ваших групп через Telegram Bot API
- Найдёт группы, где вы администратор
- Создаст записи в `telegram_groups`
- Создаст записи в `telegram_group_admins`
- После этого группы появятся в списке!

### Вариант B: Через API (если кнопка не работает)

Откройте **Browser DevTools → Console** и выполните:

```javascript
// Замените YOUR_ORG_ID на ID вашей организации
const orgId = 'YOUR_ORG_ID';

fetch(`/api/telegram/groups/update-admin-rights?orgId=${orgId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => {
  console.log('Результат:', data);
  alert(`Обновлено: ${data.updated} из ${data.total} групп`);
})
.catch(err => {
  console.error('Ошибка:', err);
});
```

### Вариант C: Через SQL (ручное добавление для тестирования)

Если варианты A и B не работают, можно вручную добавить одну группу для тестирования:

```sql
-- ЗАМЕНИТЕ значения на реальные!
-- Вам нужно узнать:
-- 1. ID вашей Telegram группы (отрицательное число, например -1001234567890)
-- 2. Название вашей группы
-- 3. Ваш Telegram User ID (число, например 123456789)

-- Создаём запись о группе
INSERT INTO telegram_groups (
  tg_chat_id,
  title,
  bot_status,
  member_count,
  created_at,
  updated_at
) VALUES (
  -1001234567890, -- ЗАМЕНИТЕ на реальный Chat ID
  'Моя тестовая группа', -- ЗАМЕНИТЕ на название
  'connected',
  1,
  NOW(),
  NOW()
)
ON CONFLICT (tg_chat_id) DO UPDATE
SET 
  title = EXCLUDED.title,
  bot_status = EXCLUDED.bot_status,
  updated_at = NOW()
RETURNING *;

-- Создаём запись о ваших правах администратора
-- Сначала найдите ID вашего user_telegram_account:
SELECT id, telegram_user_id FROM user_telegram_accounts 
WHERE is_verified = true;

-- Затем вставьте запись (ЗАМЕНИТЕ значения!)
INSERT INTO telegram_group_admins (
  user_telegram_account_id,
  tg_chat_id,
  tg_user_id,
  is_admin,
  is_owner,
  can_manage_chat,
  can_delete_messages,
  can_manage_video_chats,
  can_restrict_members,
  can_promote_members,
  can_change_info,
  can_invite_users,
  can_pin_messages,
  created_at,
  updated_at,
  expires_at
) VALUES (
  'UUID_FROM_PREVIOUS_QUERY', -- ID из user_telegram_accounts
  -1001234567890, -- Chat ID группы
  123456789, -- Ваш Telegram User ID
  true,
  true, -- Если вы владелец группы
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  NOW(),
  NOW(),
  NOW() + INTERVAL '100 years' -- Права не истекают
);
```

---

## 🔍 Шаг 3: Проверка

После обновления прав:

1. **Обновите страницу** "Доступные Telegram группы"
2. **Группы должны появиться!**

Проверьте в SQL:
```sql
SELECT 
  tg.title,
  tg.bot_status,
  tga.is_admin,
  tga.is_owner
FROM telegram_groups tg
LEFT JOIN telegram_group_admins tga ON tga.tg_chat_id = tg.tg_chat_id
WHERE tg.title IS NOT NULL;
```

---

## 🚨 Если группы всё ещё не появляются

### Проблема 1: Webhook не работает

**Проверка:**
```sql
-- Есть ли события от бота за последние 10 минут?
SELECT COUNT(*), MAX(created_at) 
FROM activity_events
WHERE tg_chat_id IS NOT NULL
AND created_at > NOW() - INTERVAL '10 minutes';
```

Если COUNT = 0 → вебхук не работает!

**Решение:** Перенастройте вебхук:

1. **Найдите ваш WEBHOOK_SECRET** в переменных окружения
2. Выполните в терминале:

```bash
# Для orbo_community_bot
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.orbo.ru/api/telegram/webhook",
    "secret_token": "<YOUR_WEBHOOK_SECRET>"
  }'

# Проверьте статус
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

### Проблема 2: Бот не администратор в группах

**Проверка:**

1. Откройте каждую группу в Telegram
2. Перейдите в настройки группы → Администраторы
3. Убедитесь, что `@orbo_community_bot` есть в списке

**Решение:** Если бота нет - добавьте его как администратора

### Проблема 3: Вы не администратор в группах

**Проверка:**

Убедитесь, что **ваш** Telegram аккаунт имеет права администратора в этих группах.

**Решение:** Если нет - попросите владельца группы добавить вас как администратора

---

## 📋 Чек-лист диагностики

- [ ] `telegram_groups` содержит записи о группах
- [ ] `telegram_group_admins` содержит ваши права
- [ ] `user_telegram_accounts` содержит ваш верифицированный аккаунт
- [ ] Бот добавлен в группы как администратор
- [ ] Вы администратор в группах
- [ ] Webhook работает (есть свежие `activity_events`)
- [ ] Кнопка "Обновить права администраторов" отработала успешно

---

## 🎯 Автоматическое решение

После того как вы нажмёте "Обновить права администраторов", система:

1. ✅ Запросит у Telegram Bot API список ваших групп
2. ✅ Для каждой группы:
   - Создаст запись в `telegram_groups`
   - Проверит права бота через `getChatMember`
   - Сохранит ваши права в `telegram_group_admins`
3. ✅ Группы появятся в списке "Доступные Telegram группы"

---

## 📚 Дополнительные файлы

- `db/CHECK_TELEGRAM_GROUPS.sql` - SQL скрипт для диагностики
- `app/api/telegram/groups/update-admin-rights/route.ts` - API для обновления прав
- `app/app/[org]/telegram/account/page.tsx` - Страница с кнопкой обновления

---

**Следующий шаг:** Откройте страницу Telegram аккаунта и нажмите "Обновить права администраторов" 🚀

Если не помогло - выполните SQL проверку и отправьте мне результаты!

