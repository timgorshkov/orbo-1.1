# Системное исправление всех проблем с командой организации

## 🔍 Найденные проблемы

### 1️⃣ Дубли user_id для одного tg_user_id
- **Статус:** ✅ РЕШЕНО миграцией 061
- **Решение:** Глобальный поиск user_id перед созданием shadow user

### 2️⃣ Telegram creator → owner организации ❌
- **Проблема:** `sync_telegram_admins` повышает Telegram creator'ов до owner организации
- **Пример:** Тимофей Горшков - admin в org, но creator в группе Test2 → стал owner
- **Причина:** Строка в функции:
  ```sql
  CASE WHEN v_admin_record.is_owner THEN 'owner' ELSE 'admin' END
  ```
- **Риск:** В организации может оказаться несколько owner'ов!

### 3️⃣ has_verified_telegram показывает false
- **Проблема:** У Тимофея `has_verified_telegram: false` в org2, хотя должно быть true
- **Причина:** VIEW `organization_admins` джойнит `user_telegram_accounts` по `org_id`
- **Но:** У Тимофея нет записи в `user_telegram_accounts` для org2!

### 4️⃣ Защита от понижения настоящего owner
- **Риск:** Если настоящий owner не будет creator в группах, его могут понизить до admin
- **Нужна:** Проверка `role_source` перед изменением роли

---

## 📋 План исправления (с проверками!)

### Этап 1: Анализ текущей логики ✅

**Проверить:**
1. Как определяется "настоящий" owner организации?
2. Когда можно/нельзя менять роль owner?
3. Когда должен показываться has_verified_telegram?

### Этап 2: Исправить логику role в sync_telegram_admins

**Правило:** 
- `is_owner` в Telegram = creator группы
- `role = 'owner'` в организации = создатель организации

**НЕ должны совпадать!**

**Новая логика:**
```sql
-- НИКОГДА не повышаем до owner через Telegram
role = 'admin'  -- Всегда admin, даже если creator в группе

-- НО сохраняем info в metadata
metadata = jsonb_build_object(
  'is_owner_in_groups', v_admin_record.is_owner,  -- Для отображения "👑 Владелец в группах"
  ...
)
```

**Защита:**
```sql
-- Не понижаем существующего owner, если он не получен через telegram_admin
UPDATE memberships
SET role = CASE 
  WHEN m.role = 'owner' AND m.role_source != 'telegram_admin' THEN 'owner'  -- Сохраняем
  ELSE 'admin'  -- Telegram-админы всегда admin
END
```

### Этап 3: Исправить has_verified_telegram в VIEW

**Проблема:** VIEW ищет только в текущей org:
```sql
LEFT JOIN user_telegram_accounts uta 
  ON uta.user_id = m.user_id 
  AND uta.org_id = m.org_id  -- ❌ Слишком строго!
```

**Решение:** Искать глобально или в любой org:
```sql
LEFT JOIN user_telegram_accounts uta 
  ON uta.user_id = m.user_id 
  AND uta.is_verified = true
  -- БЕЗ фильтра по org_id или с OR
ORDER BY uta.org_id = m.org_id DESC  -- Приоритет текущей org
LIMIT 1
```

**Но:** Нужно использовать LATERAL для правильного LEFT JOIN.

### Этап 4: Добавить логику создания user_telegram_accounts

**Проблема:** Если пользователь стал админом через группу, но не авторизовался для этой org → нет записи в `user_telegram_accounts` для org.

**Решение:** При `sync_telegram_admins` создавать `user_telegram_accounts` для org, если её нет.

### Этап 5: Почистить неправильные role

**Действие:** Понизить всех "ложных owner'ов" до admin.

**Критерий ложного owner:**
- `role = 'owner'`
- `role_source = 'telegram_admin'`
- НЕ является owner_user_id в organizations

---

## ⚠️ Проверка бизнес-логики

### Что НЕ должно сломаться:

1. **Настоящий owner организации:**
   - Должен остаться owner
   - Даже если не creator в группах
   - Проверка: `organizations.owner_user_id`

2. **Доступ к функциям owner:**
   - Страницы настроек
   - Добавление/удаление админов
   - Billing (если есть)

3. **Отображение в UI:**
   - Owner должен быть один
   - Admins - все остальные
   - Indication "👑 владелец в группах" для creator'ов

4. **Авторизация:**
   - Не должна сломаться
   - user_telegram_accounts должны создаваться корректно

### Тестовые сценарии:

1. **Настоящий owner не в группах:**
   - Не должен потерять роль owner
   
2. **Admin стал creator в группе:**
   - Должен остаться admin (не повыситься до owner)
   - Должен показываться "👑 владелец в группах"

3. **Owner покинул все группы:**
   - Должен остаться owner организации
   - Membership не должно удалиться

4. **Пользователь авторизовался через Telegram:**
   - Должна создаться запись в user_telegram_accounts
   - has_verified_telegram должно стать true

---

## 🛠️ Реализация

Создам 3 миграции по порядку:

### Миграция 062: Исправить логику role
- Обновить sync_telegram_admins
- Добавить защиту owner
- НЕ повышать до owner через Telegram

### Миграция 063: Исправить VIEW organization_admins
- Глобальный поиск user_telegram_accounts
- Правильный LEFT JOIN через LATERAL

### Миграция 064: Почистить данные
- Понизить ложных owner'ов
- Создать недостающие user_telegram_accounts

---

## 📊 Мониторинг после исправления

```sql
-- 1. Проверка owner'ов (должно быть ровно 1 на org)
SELECT org_id, COUNT(*) as owners_count
FROM memberships
WHERE role = 'owner'
GROUP BY org_id
HAVING COUNT(*) > 1;

-- 2. Проверка соответствия owner в memberships и organizations
SELECT 
  o.id as org_id,
  o.owner_user_id as real_owner,
  m.user_id as membership_owner
FROM organizations o
LEFT JOIN memberships m ON m.org_id = o.id AND m.role = 'owner'
WHERE o.owner_user_id != m.user_id;

-- 3. Проверка has_verified_telegram
SELECT 
  oa.user_id,
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

---

Приступаю к реализации! 🚀


