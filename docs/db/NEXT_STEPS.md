# 🔥 Следующие шаги для удаления дублирующего пользователя

## Что было исправлено

✅ **Обновлен `force_delete_duplicate_user.sql`**
- Добавлена очистка всех недостающих таблиц из `public` schema
- Добавлена очистка таблиц из `auth` schema (identities, sessions, mfa_factors и т.д.)
- Исправлена работа с `event_registrations` (используется `participant_id` вместо `user_id`)
- Убрана нерабочая функция `auth.delete_user()`
- Добавлена автоматическая попытка удаления с инструкциями при ошибке

✅ **Обновлен `check_what_remains.sql`**
- Исправлена работа с `event_registrations`

✅ **Созданы дополнительные инструменты**
- `delete_user_via_api.js` - скрипт для удаления через API
- `DELETE_DUPLICATE_USER_GUIDE.md` - полное руководство

## 🎯 Что делать прямо сейчас

### Вариант A: Быстрое решение (рекомендуется)

1. **Откройте Supabase SQL Editor**
2. **Запустите обновленный скрипт:**
   ```sql
   -- Файл: db/force_delete_duplicate_user.sql
   ```
3. **Смотрите результат в консоли:**
   - Если видите `✅✅✅ ПОЛЬЗОВАТЕЛЬ УСПЕШНО УДАЛЁН!` — всё готово! 🎉
   - Если видите `⚠️ НЕДОСТАТОЧНО ПРАВ` — переходите к шагу 4

4. **Если не хватило прав, удалите вручную:**
   
   **Способ 1: Через Dashboard (проще всего)**
   - Откройте: [Supabase Dashboard](https://supabase.com/dashboard) → Authentication → Users
   - Найдите: `d64f3cd8-093e-496a-868a-cf1bece66ee4`
   - Нажмите: **три точки** → **Delete user**
   
   **Способ 2: Через API скрипт**
   ```bash
   # Установите переменные окружения
   export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="eyJxxx..."
   
   # Запустите
   node db/delete_user_via_api.js
   ```

### Вариант B: Проверить перед удалением

Если хотите сначала убедиться, что скрипт очистил все данные:

1. **Запустите `check_what_remains.sql`**
2. **Проверьте вывод** — должны быть нули везде:
   ```
   memberships: 0
   participants: 0
   user_telegram_accounts: 0
   ```
3. **Если всё 0** — переходите к удалению (Вариант A, шаг 4)
4. **Если есть остатки** — посмотрите в `DELETE_DUPLICATE_USER_GUIDE.md` раздел "Дополнительная диагностика"

## 📋 Проверка после удаления

После того как удалите пользователя, проверьте:

```sql
-- 1. Пользователь удален
SELECT * FROM auth.users 
WHERE id = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';
-- Ожидается: 0 строк

-- 2. Нет дублей в команде
SELECT user_id, role, email, has_verified_telegram
FROM organization_admins
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY role;
-- Ожидается: 1 owner, без дублей
```

## 🆘 Если что-то пошло не так

1. **Прочитайте полное руководство:** `db/DELETE_DUPLICATE_USER_GUIDE.md`
2. **Запустите диагностику:** `db/check_what_remains.sql`
3. **Проверьте конкретную проблему** в разделе "Распространенные проблемы" руководства

## 📁 Файлы проекта

- `db/force_delete_duplicate_user.sql` - основной скрипт удаления (ОБНОВЛЕН ✅)
- `db/check_what_remains.sql` - проверка остатков (ОБНОВЛЕН ✅)
- `db/merge_duplicate_telegram_users.sql` - слияние аккаунтов (без изменений)
- `db/delete_user_via_api.js` - удаление через API (НОВЫЙ ✅)
- `db/DELETE_DUPLICATE_USER_GUIDE.md` - полное руководство (НОВЫЙ ✅)

---

**Рекомендация:** Начните с Варианта A — он самый простой и быстрый! 🚀


