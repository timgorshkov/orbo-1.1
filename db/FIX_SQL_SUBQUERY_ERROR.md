# ✅ Исправлена ошибка SQL: "more than one row returned by a subquery"

## 🔴 Ошибка
```
ERROR: 21000: more than one row returned by a subquery used as an expression
```

**Место:** Миграция `066_fix_bio_custom_attributes_leakage.sql`, строка 81

---

## 🐛 Причина

**Неправильный запрос:**
```sql
SELECT COUNT(DISTINCT tg_user_id) 
FROM participants 
WHERE tg_user_id IS NOT NULL 
GROUP BY tg_user_id 
HAVING COUNT(DISTINCT org_id) > 1
```

**Проблема:**
- `GROUP BY tg_user_id` возвращает **много строк** (по одной для каждого `tg_user_id`)
- Подзапрос используется как скалярное выражение (ожидается одно значение)
- SQL не может вернуть несколько строк там, где нужно одно число

---

## ✅ Решение

**Правильный запрос:**
```sql
SELECT COUNT(*) FROM (
  SELECT tg_user_id 
  FROM participants 
  WHERE tg_user_id IS NOT NULL 
  GROUP BY tg_user_id 
  HAVING COUNT(DISTINCT org_id) > 1
) AS multi_org_users
```

**Как работает:**
1. Внутренний запрос возвращает все `tg_user_id`, которые есть в >1 организации (много строк)
2. Внешний `COUNT(*)` считает эти строки и возвращает **одно число** ✅

---

## 📁 Исправленные файлы

1. ✅ `db/migrations/066_fix_bio_custom_attributes_leakage.sql` - строка 81-87
2. ✅ `db/diagnose_bio_leakage.sql` - строка 67-73

---

## 🧪 Проверка

Теперь миграция должна отработать без ошибок:

```sql
-- Запустите в Supabase SQL Editor:
db/migrations/066_fix_bio_custom_attributes_leakage.sql
```

**Ожидаемый вывод:**
```
🔍 Starting bio/custom_attributes leakage cleanup...
  Processing tg_user_id ...
    ✅ Cleaned N duplicate records...
✅ Cleanup completed!

📊 Final statistics:
  Participants with bio: 123
  Participants with custom_attributes: 45
  Participants in multiple orgs: 10  ← должно быть число!
```

---

## 💡 Урок

При использовании подзапроса в `RAISE NOTICE` или `SELECT`:
- ❌ **НЕ правильно:** подзапрос с `GROUP BY` без внешнего `COUNT(*)`
- ✅ **Правильно:** обернуть `GROUP BY` запрос в `SELECT COUNT(*) FROM (...)`

---

**Исправлено!** ✅ Миграция готова к применению.

