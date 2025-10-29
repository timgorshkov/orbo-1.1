# Исправление синтаксической ошибки в force_delete_duplicate_user.sql

## Проблема

При выполнении скрипта возникала ошибка:
```
ERROR: 42601: syntax error at or near "EXCEPTION"
LINE 168: EXCEPTION WHEN undefined_table THEN
```

## Причина

В PL/pgSQL **нельзя использовать несколько блоков `EXCEPTION` в одном `BEGIN...END` блоке**.

### Было (неправильно):
```sql
BEGIN
  DELETE FROM auth.oauth_authorizations WHERE user_id = dup_user_id;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING '  ⚠️  Недостаточно прав';
EXCEPTION WHEN undefined_table THEN  -- ❌ Синтаксическая ошибка!
  RAISE NOTICE '  Таблица не существует';
END;
```

### Стало (правильно):
```sql
BEGIN
  DELETE FROM auth.oauth_authorizations WHERE user_id = dup_user_id;
EXCEPTION 
  WHEN insufficient_privilege THEN
    RAISE WARNING '  ⚠️  Недостаточно прав';
  WHEN undefined_table THEN
    RAISE NOTICE '  Таблица не существует';
END;
```

## Решение

**Правило:** Один блок `BEGIN...END` = один блок `EXCEPTION`, но внутри `EXCEPTION` может быть несколько `WHEN` условий.

### Правильный синтаксис:
```sql
BEGIN
  -- код
EXCEPTION 
  WHEN exception_type_1 THEN
    -- обработка ошибки 1
  WHEN exception_type_2 THEN
    -- обработка ошибки 2
  WHEN OTHERS THEN
    -- обработка всех остальных ошибок
END;
```

## Исправленные блоки

В скрипте `force_delete_duplicate_user.sql` исправлены **три блока**:

1. **Шаг 15:** `auth.oauth_authorizations` (строка ~166)
   - Обрабатывает: `insufficient_privilege`, `undefined_table`

2. **Шаг 16:** `auth.oauth_consents` (строка ~179)
   - Обрабатывает: `insufficient_privilege`, `undefined_table`

3. **Шаг 17:** Финальное удаление из `auth.users` (строка ~229)
   - Обрабатывает: `insufficient_privilege`, `foreign_key_violation`

Все три блока теперь правильно используют один `EXCEPTION` блок с несколькими `WHEN` условиями.

## Статус

✅ **Исправлено** - скрипт теперь выполняется без синтаксических ошибок.

Теперь можно запускать `force_delete_duplicate_user.sql` без проблем!

