# Исправление дублей в команде организации

## 🔍 Найденные проблемы:

### Проблема 1: Дубль владельца
- **Tim Gorshkov** (owner, `9bb4b601...`) - ✅ правильный аккаунт
- **Тимофей Горшков** (admin-shadow, `aaa800d9...`) - ❌ дубль того же человека
- **Оба имеют** `tg_user_id: 154588486` (это вы!)

**Причина:** Telegram-синхронизация создала теневой профиль, когда увидела вас как администратора в группах.

### Проблема 2: Тимур Голицын - неправильный user_id
- В `memberships`: `543b9ddd...` ❌
- В `user_telegram_accounts`: `d6495527...` ✅
- **Связь нарушена** → статус верификации показывается неверно

### Проблема 3: Статусы верификации
- VIEW `organization_admins` джойнит `user_telegram_accounts` по неправильному `user_id`
- Результат: `has_verified_telegram: false`, хотя должно быть `true`

## 🛠️ Что делает скрипт:

1. ✅ Удаляет дублирующий `membership` с `role='admin'` для владельца
2. ✅ Обновляет `participant` - переносит на правильный `user_id` владельца
3. ✅ Исправляет `user_id` для Тимура Голицына в `memberships` и `participants`
4. ✅ Проверяет результат и выводит текущее состояние

## 🚀 Инструкция:

### Шаг 1: Запустите скрипт
```bash
# В Supabase SQL Editor выполните:
db/fix_team_duplicates.sql
```

### Шаг 2: Проверьте результат
Скрипт в конце покажет таблицу с текущим состоянием `organization_admins`.

**Ожидается:**
- 1 owner (Tim Gorshkov)
- 1 admin (Тимур Голицын) с `has_verified_telegram: true`
- **БЕЗ дубля** "Тимофей Горшков"

### Шаг 3: Проверьте UI
Откройте страницу настроек и проверьте блок "Команда организации".

**Должно быть:**
- **Владелец:** Tim Gorshkov, ✅ Email подтверждён, ✅ Telegram верифицирован
- **Администраторы (1):** Тимур Голицын, ✅ Telegram верифицирован

### Шаг 4: Очистка (опционально)
Если дублирующий `user_id` (`aaa800d9...`) остался в `auth.users`, удалите его:

**Способ 1: Dashboard**
- Supabase Dashboard → Authentication → Users
- Найдите `aaa800d9-8fa6-47ac-a716-f2bc7d89d862`
- Delete user

**Способ 2: SQL**
```sql
-- Проверьте, остались ли связи
SELECT COUNT(*) FROM memberships WHERE user_id = 'aaa800d9-8fa6-47ac-a716-f2bc7d89d862';
SELECT COUNT(*) FROM participants WHERE user_id = 'aaa800d9-8fa6-47ac-a716-f2bc7d89d862';

-- Если обе вернули 0, можно удалить
DELETE FROM auth.users WHERE id = 'aaa800d9-8fa6-47ac-a716-f2bc7d89d862';
```

## ⚠️ Что может пойти не так:

### Ошибка: "duplicate key value violates unique constraint"
Если скрипт упадёт с этой ошибкой, значит запись с правильным `user_id` уже существует.

**Решение:**
```sql
-- Просто удалите старые записи вручную
DELETE FROM memberships 
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  AND user_id = 'aaa800d9-8fa6-47ac-a716-f2bc7d89d862';

DELETE FROM memberships 
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  AND user_id = '543b9ddd-a31e-44f9-972b-6ab63341b8db';
```

### Статусы всё ещё неверны после скрипта
Проверьте, что VIEW `organization_admins` обновлён:

```sql
-- Посмотрите определение view
\d+ organization_admins

-- Если нужно, пересоздайте view (запустите последнюю миграцию)
-- db/migrations/060_fix_organization_admins_verification.sql
```

## 📋 Проверочный список:

- [ ] Скрипт выполнен успешно
- [ ] В финальной таблице 1 owner + 1 admin (без дубля)
- [ ] На странице настроек дубль исчез
- [ ] Статусы верификации отображаются правильно
- [ ] Тимур Голицын показывает `✅ Telegram верифицирован`
- [ ] (Опционально) Удалён дублирующий user из auth.users

---

**Если что-то пошло не так,** пришлите вывод скрипта и я помогу!


