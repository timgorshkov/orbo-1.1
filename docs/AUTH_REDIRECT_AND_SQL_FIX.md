# 🔧 Исправления: редирект после логина и SQL ошибка

## ✅ Что исправлено

### 1. 📋 Список организаций после логина

**Проблема:**
При входе пользователя с несколькими организациями происходил автоматический редирект в первую организацию, не давая выбрать нужную.

**Решение:**
- ✅ `app/auth-callback/page.tsx`: Изменён редирект на `/orgs` (список организаций) вместо `/app/{firstOrg}/dashboard`
- ✅ `app/orgs/page.tsx`: Убран автоматический редирект при одной организации (строки 99-101)

**Теперь:**
- После логина пользователь всегда видит список своих организаций
- Может выбрать нужную организацию
- Красивый UI с разделением на "Управление" (owner/admin) и "Участие" (member)

---

### 2. 🐛 SQL ошибка в `sync_telegram_admins`

**Проблема в логах:**
```
Error syncing org admins: {
  code: '42703',
  message: 'column otg.telegram_group_id does not exist'
}
```

**Причина:**
В миграции `37_fix_sync_telegram_admins_ambiguous.sql` на строке 21 использовалось неправильное имя колонки:
```sql
INNER JOIN org_telegram_groups otg ON otg.telegram_group_id = tg.id
```

Но в таблице `org_telegram_groups` (миграция 05) колонка называется `tg_chat_id`:
```sql
create table org_telegram_groups (
  org_id uuid,
  tg_chat_id bigint,  -- ← правильное имя
  ...
)
```

**Решение:**
Создана миграция `40_fix_sync_telegram_admins_column.sql`:
```sql
INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
```

---

## 📝 Применить миграцию

### Вручную в Supabase Dashboard:

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard) → ваш проект
2. **SQL Editor** → **New query**
3. Скопируйте содержимое `db/migrations/40_fix_sync_telegram_admins_column.sql`
4. Нажмите **Run**

### Или через psql:

```bash
psql "postgresql://postgres.lyijgcnrwnwusvxzeiwv:[YOUR_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" -f db/migrations/40_fix_sync_telegram_admins_column.sql
```

---

## 🧪 Проверка

### 1. Проверить редирект:
1. Выйдите из аккаунта (если авторизованы)
2. Войдите снова через `/signin`
3. Проверьте, что после входа вы видите **список организаций** на `/orgs`
4. Выберите нужную организацию

### 2. Проверить SQL ошибку:
После применения миграции 40 в логах Vercel больше не должно быть ошибки:
```
Error syncing org admins: column otg.telegram_group_id does not exist
```

---

## 📦 Изменённые файлы

```
🔧 app/auth-callback/page.tsx       (редирект на /orgs)
🔧 app/orgs/page.tsx                 (убран авто-редирект для 1 орг)
✨ db/migrations/40_fix_sync_telegram_admins_column.sql
📝 docs/AUTH_REDIRECT_AND_SQL_FIX.md
```

---

## ✅ Итого

| Проблема | Решение | Статус |
|----------|---------|--------|
| Автоматический редирект в первую организацию | Редирект на `/orgs` для выбора | ✅ Исправлено |
| Авто-редирект при 1 организации | Убран, показывается список | ✅ Исправлено |
| SQL ошибка `column otg.telegram_group_id does not exist` | Миграция 40: `tg_chat_id` | ✅ Исправлено (нужно применить) |

---

**Готово!** 🎉 После деплоя и применения миграции обе проблемы будут решены.

