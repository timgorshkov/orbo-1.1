# Анализ проблемы дублирования в команде организации

## 🔍 Логика работы системы

### Текущая архитектура:

```
memberships (таблица)
  ↓
organization_admins (VIEW)
  ↓
settings/page.tsx (серверный компонент)
  ↓
OrganizationTeam (клиентский компонент)
  ↓
UI (отображение)
```

### Проблема:

1. **Таблица `memberships`** хранит роли пользователей
   - Один `user_id` **может иметь несколько записей** с разными `role`
   - Например: `user_id: xxx, role: 'owner'` И `user_id: xxx, role: 'admin'`

2. **VIEW `organization_admins`** просто выбирает ВСЕ записи из memberships:
   ```sql
   SELECT * FROM memberships m
   WHERE m.role IN ('owner', 'admin')
   ```
   - Если у user_id две записи (owner + admin), VIEW вернёт **обе**

3. **Клиентская фильтрация** (OrganizationTeam, строка 89-92):
   ```tsx
   const admins = team.filter(m => 
     m.role === 'admin' && 
     m.user_id !== owner?.user_id
   )
   ```
   - Пытается исключить владельца из списка админов
   - НО сравнивает только `user_id`, а не саму запись
   - Если владелец имеет запись с `role='admin'`, она ОСТАНЕТСЯ в списке

## 🐛 Что происходит в вашем случае

На основе вашего вывода:

### Владелец (корректно):
- **Tim Gorshkov** (timfreelancer@gmail.com, @timgorshkov)
- role: 'owner'
- Отображается правильно

### Админ 1:
- **Тимур Голицын** - теневой профиль
- role: 'admin', source: 'telegram_admin'
- Админ в Test2

### Админ 2 (ДУБЛЬ ВЛАДЕЛЬЦА):
- **Тимофей Горшков** - теневой профиль
- role: 'admin', source: 'telegram_admin'
- НО: ВЛАДЕЛЕЦ в Test2, тест3, тест4

**Вывод:** "Тимофей Горшков" = это Tim Gorshkov (владелец), но отображается как админ!

## 🔧 Почему так произошло?

### Сценарий 1: Telegram-синхронизация создала дубль
1. Владелец добавил бота в Telegram-группы
2. Бот увидел владельца как `administrator` или `creator` в группах
3. Система автоматически создала запись в `memberships` с role='admin'
4. Теперь у владельца **две** записи: owner и admin

### Сценарий 2: Разные user_id для одного человека
1. Владелец: `user_id: AAA` (email-аккаунт)
2. Теневой профиль из Telegram: `user_id: BBB` (shadow profile)
3. Оба связаны с одним и тем же физическим лицом
4. Но система видит их как разных пользователей

## 🎯 Проверка (выполните скрипты)

### Шаг 1: Быстрая диагностика
```bash
# Запустите: db/quick_diagnose_team.sql
```

Это покажет:
- Все записи в `memberships` для вашей организации
- Есть ли дубли `user_id` с разными ролями
- Как данные выглядят в view `organization_admins`

### Шаг 2: Детальная диагностика (если нужно)
```bash
# Запустите: db/diagnose_team_display_issue.sql
```

Это покажет:
- Связи между auth.users, participants, user_telegram_accounts
- Telegram-роли в группах
- Полную картину данных

## 📊 Ожидаемые результаты диагностики

### Если дубль из-за двух ролей (Сценарий 1):
```
2. ДУБЛИ USER_ID:
⚠️  user_id: 9bb4b601-... имеет 2 записей с ролями: {admin,owner}
```

**Решение:** Удалить запись с role='admin' для владельца

### Если дубль из-за двух user_id (Сценарий 2):
```
1. ВСЕ ЗАПИСИ В MEMBERSHIPS:
  user_id: 9bb4b601-... | role: owner | email: timfreelancer@gmail.com
  user_id: d64f3cd8-... | role: admin | email: <нет> (shadow)
```

**Решение:** Слить аккаунты или удалить теневой профиль

## 🛠️ План решения

### После получения результатов диагностики:

#### Вариант A: Удаление дублирующей роли
```sql
-- Удаляем запись admin для владельца (если user_id совпадает)
DELETE FROM memberships
WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  AND role = 'admin'
  AND user_id IN (
    SELECT user_id FROM memberships 
    WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' 
      AND role = 'owner'
  );
```

#### Вариант B: Улучшение VIEW
```sql
-- Изменить view, чтобы owner не появлялся как admin
DROP VIEW IF EXISTS organization_admins;
CREATE VIEW organization_admins AS
SELECT DISTINCT ON (m.user_id) -- Берём только одну запись на user_id
  m.*,
  -- ... остальные поля
FROM memberships m
WHERE m.role IN ('owner', 'admin')
ORDER BY 
  m.user_id,
  CASE m.role WHEN 'owner' THEN 1 ELSE 2 END -- owner приоритетнее
```

#### Вариант C: Фикс в коде (серверная фильтрация)
```tsx
// В settings/page.tsx, после получения team
const teamWithGroups = (team || [])
  // Сначала группируем по user_id, берём только owner если есть
  .reduce((acc, member) => {
    const existing = acc.find(m => m.user_id === member.user_id)
    if (!existing) {
      acc.push(member)
    } else if (member.role === 'owner' && existing.role === 'admin') {
      // Заменяем admin на owner для того же user_id
      acc[acc.indexOf(existing)] = member
    }
    return acc
  }, [] as any[])
  .map((member: any) => {
    // ... остальная логика
  })
```

### Также нужно исправить статусы верификации

Проблема: `email_confirmed` и `has_verified_telegram` показывают `false`, хотя должны быть `true`.

**Возможные причины:**
1. В `auth.users` нет `email_confirmed_at` для владельца
2. В `user_telegram_accounts` нет `is_verified=true` или запись отсутствует
3. VIEW джойнит неправильно (например, по другому org_id)

**Проверка:** Будет видно в результатах диагностики (раздел 8)

## ⏭️ Следующие шаги

1. ✅ **Запустите** `db/quick_diagnose_team.sql`
2. ✅ **Пришлите** мне полный вывод
3. ⏳ Я скажу точно, какая проблема (Сценарий 1, 2 или оба)
4. ⏳ Создам точечный фикс-скрипт под вашу ситуацию
5. ⏳ Вы запустите, проблема будет решена

---

**Важно:** Не пытайтесь исправлять вручную до диагностики! Неправильные действия могут усугубить ситуацию.


