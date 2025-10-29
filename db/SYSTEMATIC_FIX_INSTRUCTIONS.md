
# 🔧 Системное исправление проблем с командой организации

## 🎯 Что исправляем

### ✅ Миграция 062: Telegram creator ≠ owner организации
**Проблема:** Пользователи, являющиеся creator в Telegram группах, ошибочно становились owner организации.

**Исправление:**
- Функция `sync_telegram_admins` больше НЕ повышает до owner
- Telegram creator → всегда `admin` в организации
- Metadata сохраняет `is_owner_in_groups: true` для отображения "👑 владелец в группах"

**Защита:**
- Настоящий owner (role_source ≠ 'telegram_admin') не будет понижен
- Owner организации = только тот, кто создал организацию

---

### ✅ Миграция 063: Очистка ложных owner'ов
**Проблема:** В БД есть пользователи с `role='owner'` и `role_source='telegram_admin'` (получены через синхронизацию).

**Исправление:**
- Понижает всех таких пользователей до `admin`
- Проверяет, что у каждой организации ровно 1 owner
- Выводит отчёт о состоянии после очистки

---

### ✅ Миграция 064: Исправление has_verified_telegram
**Проблема:** `has_verified_telegram` показывает `false`, даже если пользователь верифицирован в другой организации.

**Исправление:**
- VIEW `organization_admins` теперь ищет верификацию глобально
- Приоритет: текущая org → любая другая org → false
- Использует LATERAL JOIN для правильной логики

---

## 📋 Инструкция по применению

### Шаг 1: Запустите миграцию 062 ✅
```bash
# В Supabase SQL Editor:
db/migrations/062_fix_telegram_creator_not_org_owner.sql
```

**Ожидаемый результат:**
```
NOTICE: Migration 062 completed successfully!
NOTICE: Telegram group creators will NO LONGER become organization owners.
```

---

### Шаг 2: Запустите миграцию 063 ✅
```bash
# В Supabase SQL Editor:
db/migrations/063_cleanup_false_owners.sql
```

**Ожидаемый результат:**
- Таблица с количеством owner'ов на организацию
- Все строки должны иметь status: "✅ OK"

**Если видите "⚠️ MULTIPLE OWNERS!":**
Это нормально для первого запуска - миграция исправит это!

---

### Шаг 3: Запустите миграцию 064 ✅
```bash
# В Supabase SQL Editor:
db/migrations/064_fix_has_verified_telegram_in_view.sql
```

**Ожидаемый результат:**
```
NOTICE: Migration 064 completed successfully!
NOTICE: has_verified_telegram will now show correct status...
```

---

### Шаг 4: Проверьте обе организации 📊

**Org 1:** `a3e8bc8f-8171-472c-a955-2f7878aed6f1`
```sql
SELECT role, full_name, email, has_verified_telegram
FROM organization_admins
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END;
```

**Ожидается:**
- 1 owner (Тимофей Горшков)
- 0-1 admin (Тимур Голицын, если он админ)
- has_verified_telegram = true для обоих

**Org 2:** `7363155c-5070-4560-aa3d-89b1bef7df7b`
```sql
SELECT role, full_name, email, has_verified_telegram
FROM organization_admins
WHERE org_id = '7363155c-5070-4560-aa3d-89b1bef7df7b'
ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END;
```

**Ожидается:**
- 1 owner (Тимур Голицын)
- 1 admin (Тимофей Горшков)
- has_verified_telegram = true для обоих

---

### Шаг 5: Проверьте UI 🖥️

**Org 1:** `/app/a3e8bc8f-8171-472c-a955-2f7878aed6f1/settings`
- **Владелец:** Тимофей Горшков ✅
- **Администраторы:** (если есть) ✅
- **БЕЗ дублей** ✅

**Org 2:** `/app/7363155c-5070-4560-aa3d-89b1bef7df7b/settings`
- **Владелец:** Тимур Голицын ✅
- **Администраторы (1):** Тимофей Горшков ✅ (должен отображаться!)
- **Telegram статусы:** ✅ Верифицирован (оба)

---

## 🔍 Мониторинг после исправления

### Проверка 1: Количество owner'ов (должно быть 1 на org)
```sql
SELECT org_id, COUNT(*) as owners_count
FROM memberships
WHERE role = 'owner'
GROUP BY org_id
HAVING COUNT(*) > 1;
```
**Ожидается:** Пустой результат (нет дублей)

---

### Проверка 2: Нет ложных owner'ов от Telegram
```sql
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  u.email
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.role = 'owner' AND m.role_source = 'telegram_admin';
```
**Ожидается:** Пустой результат (все owner'ы созданы вручную)

---

### Проверка 3: has_verified_telegram корректен
```sql
SELECT 
  oa.full_name,
  oa.has_verified_telegram as view_value,
  EXISTS(
    SELECT 1 FROM user_telegram_accounts uta 
    WHERE uta.user_id = oa.user_id AND uta.is_verified = true
  ) as should_be
FROM organization_admins oa
WHERE oa.has_verified_telegram != EXISTS(
  SELECT 1 FROM user_telegram_accounts uta 
  WHERE uta.user_id = oa.user_id AND uta.is_verified = true
);
```
**Ожидается:** Пустой результат (все статусы корректны)

---

## ⚠️ Возможные проблемы

### Проблема: "No function matches the given name find_user_id_by_telegram"
**Причина:** Миграция 061 не была выполнена.

**Решение:**
```sql
-- Сначала выполните миграцию 061:
db/migrations/061_fix_sync_telegram_admins_global_search.sql
```

---

### Проблема: После миграции 063 org показывает "NO OWNER"
**Причина:** В org не было ни одного owner'а (все были с role_source='telegram_admin').

**Решение:**
```sql
-- Вручную назначьте owner'а для организации:
UPDATE memberships
SET role = 'owner', role_source = 'manual'
WHERE org_id = 'YOUR_ORG_ID'
  AND user_id = 'CORRECT_OWNER_USER_ID';
```

---

### Проблема: has_verified_telegram всё ещё false
**Причина:** У пользователя нет записи в user_telegram_accounts ни для одной org.

**Решение:**
Пользователь должен авторизоваться через Telegram хотя бы в одной организации:
1. Открыть материал/событие с ограниченным доступом
2. Ввести код от бота
3. Авторизоваться

После этого запись появится и статус станет true.

---

## ✅ Контрольный список

- [ ] Миграция 062 выполнена успешно
- [ ] Миграция 063 выполнена успешно
- [ ] Миграция 064 выполнена успешно
- [ ] Проверка 1 (дубли owner'ов) = пусто
- [ ] Проверка 2 (ложные owner'ы) = пусто
- [ ] Проверка 3 (has_verified_telegram) = пусто
- [ ] UI org1: owner корректен, нет дублей
- [ ] UI org2: owner + admin корректны, статусы верифицированы
- [ ] Тестирование: добавить бота в новую группу → синхронизировать → creator стал admin (НЕ owner)

---

## 🎉 Результат

После выполнения всех миграций:

✅ **Telegram creator'ы больше НЕ становятся owner'ами организации**  
✅ **Каждая организация имеет ровно 1 owner'а**  
✅ **has_verified_telegram показывается корректно**  
✅ **Дубли в команде исчезли**  
✅ **UI отображает команду правильно**

---

**Если возникли проблемы, пришлите:**
1. Результаты Проверок 1-3
2. Скриншот UI страницы настроек
3. Результат запроса для org_id из Шага 4

Я помогу разобраться! 🚀


