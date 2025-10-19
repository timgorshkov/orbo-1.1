# Комплексное исправление логики работы с администраторами Telegram-групп

## Обзор проблемы

При тестировании была обнаружена серия проблем с работой администраторов Telegram-групп, отличных от владельца организации:

1. ❌ Новый админ группы не появляется в "Команде организации"
2. ❌ Синхронизация команды выдает 405 ошибку
3. ❌ "Обновить права администраторов" показывает "0 из undefined"
4. ❌ Нет индикации админов во вкладке "Участники" группы
5. ❌ Нет индикации админов в общем списке участников
6. ❌ Неясная логика регистрации/авторизации админов

---

## ✅ Исправленные проблемы (Phase 1)

### 1. Исправлена 405 ошибка при синхронизации команды

**Проблема:**  
Клиент обращался к `/api/organizations/[id]/team/sync`, но в Next.js App Router POST-endpoint определён как `/api/organizations/[id]/team`.

**Решение:**
```typescript
// components/settings/organization-team.tsx
const response = await fetch(`/api/organizations/${organizationId}/team`, {
  method: 'POST' // Было: /team/sync
})
```

**Файлы:**
- `components/settings/organization-team.tsx`

---

### 2. Исправлено "0 из undefined" при обновлении прав

**Проблема:**  
API endpoint `/api/telegram/groups/update-admin-rights` не возвращал поля `updated` и `total`, которые ожидал клиент.

**Решение:**
```typescript
// app/api/telegram/groups/update-admin-rights/route.ts
return NextResponse.json({
  success: true,
  message: `Checked admin rights for ${normalizedChatIds.length} chats`,
  updated: updatedGroups.length,     // Добавлено
  total: normalizedChatIds.length,   // Добавлено
  updatedGroups,
  warnings
});
```

**Файлы:**
- `app/api/telegram/groups/update-admin-rights/route.ts`

---

### 3. Создана таблица telegram_group_admins

**Проблема:**  
Использовалась несуществующая таблица. Код пытался писать в `telegram_group_admins`, но миграции для неё не было.

**Решение:**  
Создана полноценная таблица с детальными правами администраторов:

```sql
CREATE TABLE telegram_group_admins (
  id SERIAL PRIMARY KEY,
  tg_chat_id BIGINT NOT NULL,
  tg_user_id BIGINT NOT NULL,
  user_telegram_account_id INTEGER REFERENCES user_telegram_accounts(id),
  
  -- Статус
  is_admin BOOLEAN DEFAULT FALSE,
  is_owner BOOLEAN DEFAULT FALSE,
  custom_title TEXT, -- Должность из Telegram
  
  -- Детальные права
  can_manage_chat BOOLEAN,
  can_delete_messages BOOLEAN,
  can_manage_video_chats BOOLEAN,
  can_restrict_members BOOLEAN,
  can_promote_members BOOLEAN,
  can_change_info BOOLEAN,
  can_invite_users BOOLEAN,
  can_pin_messages BOOLEAN,
  can_post_messages BOOLEAN,
  can_edit_messages BOOLEAN,
  
  -- Временные метки
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  UNIQUE(tg_chat_id, tg_user_id)
);
```

**Файлы:**
- `db/migrations/43_create_telegram_group_admins.sql`

---

### 4. Обновлена функция sync_telegram_admins

**Проблема:**  
Функция использовала устаревшую таблицу `user_group_admin_status`, которая не заполнялась через API.

**Решение:**  
Переписана для использования `telegram_group_admins`:

```sql
CREATE OR REPLACE FUNCTION sync_telegram_admins(p_org_id UUID)
RETURNS TABLE(user_id UUID, action TEXT, groups_count INTEGER) 
AS $$
BEGIN
  WITH telegram_admins AS (
    SELECT DISTINCT
      uta.user_id AS admin_user_id,
      ARRAY_AGG(DISTINCT tg.id) as group_ids,
      ARRAY_AGG(DISTINCT tg.title) as group_titles,
      ARRAY_AGG(DISTINCT tga.custom_title) FILTER (WHERE tga.custom_title IS NOT NULL) as custom_titles
    FROM telegram_group_admins tga
    INNER JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
    INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
    INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
    WHERE 
      otg.org_id = p_org_id
      AND tga.is_admin = true
      AND uta.user_id IS NOT NULL
      AND uta.is_verified = true
      AND tga.expires_at > NOW()
    GROUP BY uta.user_id
  )
  ...
END;
$$;
```

**Особенности:**
- ✅ Использует актуальную таблицу `telegram_group_admins`
- ✅ Проверяет `expires_at` для актуальности прав
- ✅ Сохраняет custom_title (должности из Telegram)
- ✅ Автоматически удаляет админов, потерявших права

**Файлы:**
- `db/migrations/44_sync_telegram_admins_use_new_table.sql`

---

### 5. Добавлено сохранение custom_title

**Проблема:**  
Название должности администратора из Telegram не сохранялось.

**Решение:**  
Обновлены оба endpoint'а для сохранения `custom_title`:

```typescript
// update-admin-rights/route.ts и update-admins/route.ts
const upsertPayload = {
  tg_chat_id: chatId,
  tg_user_id: activeAccount.telegram_user_id,
  user_telegram_account_id: activeAccount.id,
  is_owner: isOwner,
  is_admin: isAdmin,
  custom_title: member.custom_title || null, // ✅ Добавлено
  can_manage_chat: member.can_manage_chat || false,
  // ... остальные права
};
```

**Файлы:**
- `app/api/telegram/groups/update-admin-rights/route.ts`
- `app/api/telegram/groups/update-admins/route.ts`

---

### 6. Обновлена view organization_admins

**Решение:**  
Добавлено поле `custom_titles_json` для отображения должностей:

```sql
CREATE VIEW organization_admins AS
SELECT 
  m.org_id,
  m.user_id,
  m.role,
  m.role_source,
  m.metadata,
  ...
  m.metadata->>'custom_titles' as custom_titles_json -- ✅ Добавлено
FROM memberships m
...
WHERE m.role IN ('owner', 'admin');
```

**Файлы:**
- `db/migrations/45_update_organization_admins_view.sql`

---

## 🚧 Задачи в разработке (Phase 2)

### 7. Иконки админов во вкладке "Участники" группы

**План:**
- Добавить запрос к `telegram_group_admins` при загрузке участников
- Отобразить иконку 👑 для владельца и 🛡️ для админа
- Показать `custom_title`, если есть

**Файлы для изменения:**
- `app/app/[org]/telegram/groups/[groupId]/page.tsx`

---

### 8. Иконки админов в общем списке участников

**План:**
- Обновить компонент списка участников
- Добавить индикацию статуса админа
- Показать группы, где пользователь - админ

**Файлы для изменения:**
- `app/app/[org]/members/page.tsx`
- Компоненты в `components/members/`

---

### 9. Права доступа для админов групп

**Текущая ситуация:**
- Роли определяются в таблице `memberships`
- RLS политики используют функцию `get_user_role`

**План проверки:**
1. Проверить `get_user_role` - учитывает ли она role_source='telegram_admin'?
2. Убедиться, что админы видят:
   - Свои группы в списке
   - Материалы и события организации
   - Участников групп, где они админы
3. Проверить права на создание/редактирование:
   - Материалов
   - Событий
   - Управление участниками

---

### 10. Логика регистрации/авторизации админов

**Варианты для обсуждения с пользователем:**

#### Вариант А: Приглашение с привязкой Telegram
1. Админ группы получает приглашение на email
2. Регистрируется через email+пароль
3. Привязывает Telegram-аккаунт через верификационный код
4. Система автоматически определяет группы, где он админ

**Плюсы:** Полный контроль над доступом  
**Минусы:** Требует дополнительных шагов от админа

#### Вариант Б: Автоматическое создание профиля
1. Система обнаруживает нового админа в группе
2. Создаётся "теневой" профиль без email
3. Админ может "активировать" профиль через Telegram-бота
4. При активации запрашивается email для полного доступа

**Плюсы:** Быстрый старт, минимум действий  
**Минусы:** Неполные профили в системе

#### Вариант В: Telegram-first подход
1. Админ сначала общается с @orbo_assistant_bot
2. Бот предлагает привязать email или продолжить без него
3. Без email - ограниченный доступ (только просмотр)
4. С email - полный доступ к созданию/редактированию

**Плюсы:** Гибкость, постепенное вовлечение  
**Минусы:** Сложнее реализация, два типа доступа

#### Вариант Г: Обязательная привязка
1. Админ обнаруживается в группе
2. Уведомление владельцу организации о новом админе
3. Владелец отправляет приглашение на email админа
4. Админ регистрируется и привязывает Telegram

**Плюсы:** Полный контроль владельца, безопасность  
**Минусы:** Требует участия владельца, медленно

---

## 📊 Структура данных

### Таблицы

```
telegram_group_admins         ← Кто админ в какой группе
  ├─ tg_chat_id
  ├─ tg_user_id
  ├─ user_telegram_account_id ────> user_telegram_accounts
  ├─ is_admin, is_owner              └─ user_id ────> auth.users
  ├─ custom_title                                       │
  └─ expires_at                                         ▼
                                                   memberships
org_telegram_groups           ← Группы организации     ├─ org_id
  ├─ org_id                                             ├─ user_id
  └─ tg_chat_id ────> telegram_groups                   ├─ role
                        └─ title                        ├─ role_source
                                                        └─ metadata
```

### Процесс синхронизации

```
1. API: /api/telegram/groups/update-admin-rights
   ├─ Получает список групп организации
   ├─ Проверяет права через Telegram API
   └─ Сохраняет в telegram_group_admins

2. API: /api/organizations/[id]/team (POST)
   ├─ Вызывает sync_telegram_admins(org_id)
   ├─ Функция читает telegram_group_admins
   ├─ Обновляет memberships (role='admin', role_source='telegram_admin')
   └─ Удаляет админов, потерявших права

3. View: organization_admins
   ├─ Объединяет memberships + user_telegram_accounts
   └─ Возвращает полную информацию с custom_titles
```

---

## 🔧 Миграции для применения

В порядке выполнения:

1. `43_create_telegram_group_admins.sql` - Создаёт таблицу
2. `44_sync_telegram_admins_use_new_table.sql` - Обновляет функцию
3. `45_update_organization_admins_view.sql` - Обновляет view

**Команда:**
```bash
# Применить все миграции
psql -d your_database < db/migrations/43_create_telegram_group_admins.sql
psql -d your_database < db/migrations/44_sync_telegram_admins_use_new_table.sql
psql -d your_database < db/migrations/45_update_organization_admins_view.sql
```

---

## 🧪 Тестирование

### Сценарий 1: Добавление нового админа

1. Назначить пользователя админом Telegram-группы
2. На странице "Настройка Telegram аккаунта" нажать "Обновить права администраторов"
3. Должно показать "Обновлены права: 1 из N"
4. В "Настройки → Команда организации" нажать "Синхронизировать с Telegram"
5. Новый админ должен появиться в списке с указанием групп

### Сценарий 2: Потеря прав админа

1. Убрать права админа у пользователя в Telegram
2. Обновить права через "Обновить права администраторов"
3. Синхронизировать команду
4. Админ должен быть удалён из "Команды организации"

### Сценарий 3: Custom title

1. Назначить админу должность в Telegram (например, "Модератор")
2. Обновить права
3. Синхронизировать команду
4. В "Команде организации" должна отображаться должность

---

## ⚠️ Узкие места и ограничения

### 1. Идентификация пользователя

**Проблема:** Связь между tg_user_id и user_id требует верифицированного Telegram-аккаунта.

**Решение:** 
- Админ ДОЛЖЕН пройти верификацию через @orbo_assistant_bot
- Без верификации его права не синхронизируются

### 2. Множественные организации

**Проблема:** Пользователь может быть админом групп в разных организациях.

**Текущее поведение:**
- `memberships` хранит связь user_id + org_id
- Каждая организация получает свою запись о правах админа
- metadata содержит только группы этой организации

### 3. Время истечения прав (expires_at)

**Проблема:** Права кешируются на 7 дней, могут устареть.

**Решение:**
- Периодическая ресинхронизация (раз в день?)
- Кнопка "Обновить права" для ручной синхронизации
- Функция sync_telegram_admins игнорирует истёкшие записи

### 4. Производительность

**Проблема:** Для каждой группы делается отдельный API-запрос к Telegram.

**Оптимизации:**
- Батчинг запросов (пока не реализовано)
- Кеширование результатов
- Фоновая синхронизация

### 5. Права доступа участников

**Проблема:** Обычным участникам нужен доступ к событиям и материалам, но не к управлению.

**Требования:**
- Участники могут видеть материалы своей группы
- Участники могут регистрироваться на события
- Админы могут создавать материалы и события
- Владелец имеет полный контроль

**RLS политики для проверки:**
- `materials` - кто может читать/писать?
- `events` - кто может создавать/редактировать?
- `participants` - кто может видеть список?

---

## 📋 Чеклист перед деплоем

- [ ] Применить миграции 43, 44, 45
- [ ] Проверить, что update-admin-rights возвращает updated/total
- [ ] Проверить, что sync работает без 405 ошибки
- [ ] Проверить отображение админов в Команде организации
- [ ] Добавить иконки админов в UI участников
- [ ] Проверить права доступа для role='admin' + role_source='telegram_admin'
- [ ] Согласовать логику регистрации/авторизации админов
- [ ] Добавить документацию для пользователей
- [ ] Настроить автоматическую периодическую синхронизацию

---

## 💡 Рекомендации для пользователя

Перед продолжением нужно согласовать:

1. **Логику регистрации админов** (варианты А, Б, В или Г выше)
2. **Уровень доступа** для неверифицированных админов
3. **Частоту автосинхронизации** прав администраторов
4. **UI для индикации** статуса админа (иконки, цвета, положение)

**Вопросы для обсуждения:**
- Может ли админ без email создавать материалы/события?
- Должен ли владелец утверждать новых админов?
- Нужны ли уведомления при изменении прав админа?
- Показывать ли всех админов всех групп или только своих?

---

**Дата:** 2025-10-19  
**Автор:** AI Assistant (Claude Sonnet 4.5)  
**Статус:** Phase 1 завершена, Phase 2 требует согласования

