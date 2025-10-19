# Комплексное решение: Логика администраторов Telegram-групп

**Дата:** 2025-10-19  
**Статус:** ✅ Реализовано  
**Вариант:** Б - Автоматическое создание теневых профилей с постепенной активацией

---

## Оглавление

1. [Обзор решения](#обзор-решения)
2. [Реализованные компоненты](#реализованные-компоненты)
3. [Архитектура](#архитектура)
4. [Миграции базы данных](#миграции-базы-данных)
5. [API Endpoints](#api-endpoints)
6. [UI Компоненты](#ui-компоненты)
7. [Права доступа и RLS](#права-доступа-и-rls)
8. [Сценарии использования](#сценарии-использования)
9. [Узкие места и ограничения](#узкие-места-и-ограничения)
10. [Дальнейшие улучшения](#дальнейшие-улучшения)

---

## Обзор решения

### Выбранный подход: Вариант Б

**Автоматическое создание профилей с постепенной активацией**

- ✅ **Автоматическое обнаружение** - система создаёт membership при обнаружении админа через `sync_telegram_admins`
- ✅ **Режим чтения без email** - админы без подтверждённого email могут только просматривать
- ✅ **Возможность активации** - админ сам добавляет и подтверждает email для получения полных прав
- ✅ **Конфликт email** - обработка сценариев, когда email уже занят (merge accounts или использование другого email)
- ✅ **Ручное добавление** - форма для владельца для приглашения админов по email

---

## Реализованные компоненты

### 1. ✅ Исправлены ошибки синхронизации

**Проблемы:**
- 405 ошибка при синхронизации команды организации
- "Обновлены права администраторов: 0 из undefined"

**Решение:**
- Исправлен эндпоинт `POST /api/organizations/[id]/team` (теперь возвращает результаты sync)
- Исправлен `POST /api/telegram/groups/update-admin-rights/route.ts` (возвращает `updated` и `total`)
- Обновлён клиентский код в `organization-team.tsx` и `app/app/[org]/telegram/account/page.tsx`

### 2. ✅ Отображение админов в Команде организации

- Создана view `organization_admins` с полями `has_verified_telegram`, `telegram_user_id`
- Обновлена функция `sync_telegram_admins` для использования новой таблицы `telegram_group_admins`
- В UI показываются админы с группами, в которых они имеют права, и их custom titles

### 3. ✅ Иконки админов в UI участников

**Компоненты:**
- `components/admin-badge.tsx` - универсальный компонент для отображения статуса админа/владельца
- Интегрирован в:
  - `app/app/[org]/telegram/groups/[groupId]/page.tsx` - вкладка участников группы
  - `components/members/members-table.tsx` - таблица участников
  - `components/members/member-card.tsx` - карточки участников

**API:**
- `app/api/telegram/analytics/data/route.ts` - обогащён информацией об админах
- `app/app/[org]/members/page.tsx` - участники обогащаются данными об админах из `memberships` и `telegram_group_admins`

### 4. ✅ Логика теневых профилей (Shadow Profiles)

**Миграции:**
- `46_sync_telegram_admins_with_shadow_profiles.sql` - обновлена функция `sync_telegram_admins`
- `47_rls_policies_for_shadow_admins.sql` - RLS политики для разделения прав

**Функциональность:**
- Автоматическое создание membership при обнаружении админа в Telegram
- Отметка `shadow_profile: true` в metadata для админов без email
- Функция `is_activated_admin(user_id, org_id)` для проверки прав

### 5. ✅ Активация профиля через email

**UI:**
- `app/settings/profile/page.tsx` - страница активации профиля
- `components/shadow-profile-banner.tsx` - баннер с призывом добавить email

**API:**
- `app/api/auth/activate-profile/route.ts`:
  - `POST /api/auth/activate-profile` (action: `send_code`) - отправка кода верификации
  - `POST /api/auth/activate-profile` (action: `verify_code`) - подтверждение кода
  - `GET /api/auth/activate-profile` - проверка статуса активации

**Логика:**
1. Админ заходит через Telegram auth code
2. Видит баннер с предложением добавить email
3. Вводит email, получает код верификации
4. Подтверждает код, профиль активируется
5. Получает полные права на создание и редактирование

### 6. ✅ Ручное добавление админов

**UI:**
- `components/settings/add-admin-dialog.tsx` - диалог добавления админа
- Интегрирован в `components/settings/organization-team.tsx`

**API:**
- `app/api/organizations/[id]/team/add/route.ts`:
  - Проверка существования email
  - Если пользователь существует - добавляет membership
  - Если нет - создаёт приглашение в таблице `invitations`

**Миграция:**
- `48_create_invitations_table.sql` - таблица для приглашений

### 7. ✅ Детальная информация об админах

**Таблица:**
- `telegram_group_admins` (migration 43) - хранит детальную информацию:
  - `is_owner`, `is_admin`
  - `custom_title` - должность администратора в группе
  - `can_*` permissions (manage_chat, delete_messages, etc.)
  - `expires_at` - требуется периодическая проверка прав

**API:**
- `app/api/telegram/groups/update-admin-rights/route.ts` - обновляет права админов
- `app/api/telegram/groups/update-admins/route.ts` - альтернативный endpoint

---

## Архитектура

### Таблицы базы данных

```sql
-- Таблица с детальной информацией об админах
telegram_group_admins (
  id UUID PRIMARY KEY,
  tg_chat_id BIGINT NOT NULL,
  tg_user_id BIGINT NOT NULL,
  user_telegram_account_id UUID REFERENCES user_telegram_accounts,
  is_owner BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  custom_title TEXT, -- "Модератор", "Главный админ", etc.
  can_manage_chat BOOLEAN,
  can_delete_messages BOOLEAN,
  can_post_messages BOOLEAN,
  ...
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL, -- Требует ре-верификации
  UNIQUE(tg_chat_id, tg_user_id)
);

-- Таблица приглашений
invitations (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'cancelled'
  invited_by UUID REFERENCES auth.users,
  expires_at TIMESTAMPTZ NOT NULL,
  ...
);

-- View для проверки статуса админов
user_admin_status AS
SELECT 
  m.user_id,
  m.org_id,
  m.role,
  u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL AS has_confirmed_email,
  m.metadata->>'shadow_profile' = 'true' AS is_shadow_profile,
  is_activated_admin(m.user_id, m.org_id) AS is_activated
FROM memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE m.role IN ('owner', 'admin');
```

### Поток данных

```
Telegram Group Admin
        ↓
update_admin_rights API
        ↓
telegram_group_admins table
        ↓
sync_telegram_admins function
        ↓
memberships table (shadow_profile: true/false)
        ↓
RLS policies (is_activated_admin)
        ↓
UI access (read/write)
```

---

## Миграции базы данных

### Миграция 43: `telegram_group_admins` table
**Файл:** `db/migrations/43_create_telegram_group_admins.sql`

Создаёт таблицу для детального хранения информации об админах.

### Миграция 44: Update `sync_telegram_admins` function
**Файл:** `db/migrations/44_sync_telegram_admins_use_new_table.sql`

Обновляет функцию `sync_telegram_admins` для использования `telegram_group_admins`.

### Миграция 45: Update `organization_admins` view
**Файл:** `db/migrations/45_update_organization_admins_view.sql`

Добавляет `has_verified_telegram`, `telegram_user_id` в view.

### Миграция 46: Shadow Profiles Support
**Файл:** `db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql`

Добавляет поддержку теневых профилей в `sync_telegram_admins`:
- Проверяет наличие email при создании membership
- Добавляет `shadow_profile: true/false` в metadata
- Возвращает `is_shadow` в результатах

### Миграция 47: RLS Policies
**Файл:** `db/migrations/47_rls_policies_for_shadow_admins.sql`

Создаёт функцию `is_activated_admin()` и обновляет RLS политики:
- Только активированные админы (с email) могут создавать/редактировать материалы и события
- Теневые админы имеют доступ только на чтение

### Миграция 48: Invitations Table
**Файл:** `db/migrations/48_create_invitations_table.sql`

Создаёт таблицу `invitations` для ручного добавления админов.

---

## API Endpoints

### Управление командой организации

#### `GET /api/organizations/[id]/team`
Получает список команды организации (owner + admins).

**Response:**
```json
{
  "team": [
    {
      "user_id": "uuid",
      "role": "owner" | "admin",
      "role_source": "manual" | "telegram_admin",
      "email": "user@example.com",
      "full_name": "John Doe",
      "telegram_username": "johndoe",
      "has_verified_telegram": true,
      "metadata": {
        "telegram_groups": [1, 2, 3],
        "telegram_group_titles": ["Group 1", "Group 2", "Group 3"],
        "custom_titles": ["Модератор", null, "Главный админ"]
      }
    }
  ]
}
```

#### `POST /api/organizations/[id]/team`
Синхронизирует админов из Telegram (вызывает `sync_telegram_admins`).

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "user_id": "uuid",
      "action": "added" | "updated" | "removed",
      "groups_count": 2,
      "is_shadow": true
    }
  ]
}
```

#### `POST /api/organizations/[id]/team/add`
Ручное добавление админа по email.

**Request:**
```json
{
  "email": "admin@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Администратор успешно добавлен" | "Приглашение отправлено на email",
  "user_id": "uuid" | null,
  "invitation_id": "uuid" | null
}
```

### Активация профиля

#### `GET /api/auth/activate-profile`
Проверяет статус активации профиля.

**Response:**
```json
{
  "user_id": "uuid",
  "email": "user@example.com" | null,
  "has_email": true | false,
  "is_shadow_profile": true | false,
  "needs_activation": true | false,
  "admin_orgs": [
    {
      "org_id": "uuid",
      "role": "admin",
      "is_shadow": true
    }
  ]
}
```

#### `POST /api/auth/activate-profile`
Отправляет код верификации или подтверждает код.

**Request (send_code):**
```json
{
  "action": "send_code",
  "email": "user@example.com"
}
```

**Response (send_code):**
```json
{
  "success": true,
  "message": "Код подтверждения отправлен на email",
  "dev_code": "123456" // только в dev режиме
}
```

**Request (verify_code):**
```json
{
  "action": "verify_code",
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (verify_code):**
```json
{
  "success": true,
  "message": "Email успешно подтверждён!"
}
```

**Errors:**
- `409` - Email конфликт (уже используется другим аккаунтом)
- `400` - Неверный код или истёк срок действия

### Обновление прав админов

#### `POST /api/telegram/groups/update-admin-rights`
Проверяет и обновляет права админов в группах.

**Request:**
```json
{
  "orgId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Checked admin rights for 5 chats",
  "updated": 3,
  "total": 5,
  "updatedGroups": ["Group 1", "Group 2", "Group 3"],
  "warnings": []
}
```

### Аналитика группы

#### `GET /api/telegram/analytics/data?orgId=X&chatId=Y`
Возвращает аналитику группы, включая участников с информацией об админах.

**Response (participants):**
```json
{
  "participants": [
    {
      "tg_user_id": 123456789,
      "username": "johndoe",
      "full_name": "John Doe",
      "message_count": 42,
      "last_activity": "2025-10-19T12:00:00Z",
      "risk_score": 15,
      "is_owner": false,
      "is_admin": true,
      "custom_title": "Модератор"
    }
  ]
}
```

---

## UI Компоненты

### `AdminBadge`
**Файл:** `components/admin-badge.tsx`

Универсальный компонент для отображения статуса админа/владельца.

**Props:**
```typescript
interface AdminBadgeProps {
  isOwner?: boolean
  isAdmin?: boolean
  customTitle?: string | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}
```

**Использование:**
```tsx
<AdminBadge 
  isOwner={false}
  isAdmin={true}
  customTitle="Модератор"
  size="sm"
  showLabel={true}
/>
```

### `ShadowProfileBanner`
**Файл:** `components/shadow-profile-banner.tsx`

Баннер с призывом добавить email для активации профиля.

### `AddAdminDialog`
**Файл:** `components/settings/add-admin-dialog.tsx`

Диалог для ручного добавления админа по email.

### Страницы

#### `/settings/profile`
**Файл:** `app/settings/profile/page.tsx`

Страница активации профиля:
- Ввод email
- Ввод кода верификации
- Обработка конфликтов email

#### `/app/[org]/settings` - Команда организации
**Файл:** `components/settings/organization-team.tsx`

Отображает команду:
- Владелец
- Админы с группами и custom titles
- Кнопка синхронизации
- Кнопка добавления админа (только для владельца)

#### `/app/[org]/telegram/groups/[groupId]` - Участники группы
**Файл:** `app/app/[org]/telegram/groups/[groupId]/page.tsx`

Вкладка "Участники":
- Таблица участников с колонкой "Роль"
- Иконки владельца/админа с custom titles

#### `/app/[org]/members` - Все участники
**Файл:** `app/app/[org]/members/page.tsx`

Список участников:
- Таблица с колонкой "Роль"
- Карточки с иконками админов
- Обогащение данных из `memberships` и `telegram_group_admins`

---

## Права доступа и RLS

### Функция `is_activated_admin`

```sql
CREATE OR REPLACE FUNCTION is_activated_admin(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM memberships m
    INNER JOIN auth.users u ON u.id = m.user_id
    WHERE 
      m.user_id = p_user_id
      AND m.org_id = p_org_id
      AND m.role IN ('owner', 'admin')
      AND (
        m.role = 'owner' 
        OR (u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL)
      )
  );
$$;
```

### RLS Политики

#### Материалы

```sql
-- Создание
CREATE POLICY "Activated admins can create materials"
  ON material_pages FOR INSERT
  TO authenticated
  WITH CHECK (is_activated_admin(auth.uid(), org_id));

-- Редактирование
CREATE POLICY "Activated admins can update materials"
  ON material_pages FOR UPDATE
  TO authenticated
  USING (is_activated_admin(auth.uid(), org_id));

-- Удаление
CREATE POLICY "Activated admins can delete materials"
  ON material_pages FOR DELETE
  TO authenticated
  USING (is_activated_admin(auth.uid(), org_id));
```

#### События

```sql
-- Создание
CREATE POLICY "Activated admins can create events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (is_activated_admin(auth.uid(), org_id));

-- Редактирование
CREATE POLICY "Activated admins can update events"
  ON events FOR UPDATE
  TO authenticated
  USING (is_activated_admin(auth.uid(), org_id));

-- Удаление
CREATE POLICY "Activated admins can delete events"
  ON events FOR DELETE
  TO authenticated
  USING (is_activated_admin(auth.uid(), org_id));
```

### Матрица прав доступа

| Роль | Email | Статус | Просмотр | Создание | Редактирование | Удаление |
|------|-------|--------|----------|----------|----------------|----------|
| **Owner** | ✅ | Активирован | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | Активирован | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ❌ | Теневой | ✅ | ❌ | ❌ | ❌ |
| **Member** | ✅/❌ | - | ✅ | ❌ | ❌ | ❌ |

---

## Сценарии использования

### Сценарий 1: Новый админ из Telegram

1. Пользователь назначен админом в Telegram-группе
2. `update_admin_rights` API обновляет `telegram_group_admins`
3. Владелец нажимает "Синхронизировать с Telegram"
4. `sync_telegram_admins` создаёт membership с `shadow_profile: true`
5. Админ заходит через Telegram auth code
6. Видит список организаций, в которых он админ
7. Видит баннер: "Добавьте email для полного доступа"
8. Переходит в `/settings/profile`
9. Вводит email, получает код, подтверждает
10. Профиль активирован, получает права на создание/редактирование

### Сценарий 2: Ручное добавление админа

1. Владелец открывает "Настройки - Команда организации"
2. Нажимает "+ Добавить администратора"
3. Вводит email админа
4. Если email существует:
   - Создаётся membership с `role: admin`, `role_source: manual`
   - Админ получает уведомление (TODO)
5. Если email не существует:
   - Создаётся приглашение в таблице `invitations`
   - Отправляется email с ссылкой (TODO)
6. Админ заходит и имеет полные права (email подтверждён)

### Сценарий 3: Конфликт email

1. Теневой админ пытается добавить email
2. Email уже используется другим пользователем
3. Система проверяет:
   - Если у того пользователя есть Telegram → ошибка "используется другим аккаунтом"
   - Если нет Telegram → предложение объединить аккаунты (TODO)

### Сценарий 4: Потеря прав админа

1. Админ удалён из всех Telegram-групп
2. Владелец нажимает "Синхронизировать с Telegram"
3. `sync_telegram_admins` удаляет membership с `role_source: telegram_admin`
4. Админ теряет доступ к организации

---

## Узкие места и ограничения

### 1. Объединение аккаунтов (Account Merging)

**Статус:** ❌ Не реализовано

**Проблема:**
- Если теневой админ пытается добавить email, который уже используется
- Нужен механизм подтверждения и объединения аккаунтов

**Возможное решение:**
1. Отправить код на существующий email
2. Если подтверждён - перенести `tg_user_id` на существующий user
3. Объединить memberships
4. Удалить теневой профиль

### 2. Email-уведомления

**Статус:** ❌ Не реализовано

**Что нужно:**
- Отправка кодов верификации на email
- Отправка приглашений новым админам
- Уведомления о добавлении в команду

**Временное решение:**
- Коды логируются в консоль (dev mode)
- В production нужен email service (SendGrid, Mailgun, etc.)

### 3. Периодическая ре-верификация админов

**Статус:** ⚠️ Частично реализовано

**Что есть:**
- Поле `expires_at` в `telegram_group_admins`
- Фильтрация по `gt('expires_at', NOW())`

**Что нужно:**
- Cron job для периодической проверки прав админов
- Автоматическое обновление `expires_at`
- Уведомления об истечении прав

### 4. Права доступа для специфических групп

**Статус:** ❌ Не реализовано

**Проблема:**
- Админ группы A не должен иметь доступ к материалам группы B

**Текущее поведение:**
- Админ имеет доступ ко всей организации

**Возможное решение:**
- Добавить `group_id` в RLS политики
- Проверять, является ли админ админом конкретной группы

### 5. Масштабируемость `sync_telegram_admins`

**Статус:** ⚠️ Возможны проблемы

**Проблема:**
- Функция вызывается вручную владельцем
- При большом количестве групп и админов может быть медленной

**Возможное решение:**
- Автоматическая синхронизация через webhook при изменении админов
- Инкрементальная синхронизация (только изменённые группы)

### 6. Deep Links для участников

**Статус:** ❌ Не реализовано

**Что нужно:**
- `t.me/bot?start=org_chat` для идентификации источника
- Автоматическая привязка участника к организации

---

## Дальнейшие улучшения

### Краткосрочные (1-2 недели)

1. ✅ Добавить email service для отправки кодов и приглашений
2. ✅ Реализовать механизм объединения аккаунтов
3. ✅ Добавить автоматическую синхронизацию админов через webhook
4. ✅ Настроить rights-based access для конкретных групп

### Среднесрочные (1 месяц)

5. ✅ Реализовать периодическую ре-верификацию админов (cron job)
6. ✅ Добавить уведомления об изменении прав
7. ✅ Реализовать deep links для участников
8. ✅ Добавить страницу для принятия приглашений

### Долгосрочные (3+ месяца)

9. ✅ Расширенная ролевая модель (moderator, viewer, etc.)
10. ✅ Детальные permissions для каждой роли
11. ✅ Audit log для действий админов
12. ✅ Dashboard для владельца с метриками команды

---

## Заключение

Реализована комплексная система управления администраторами Telegram-групп с автоматическим обнаружением, постепенной активацией через email и детальным контролем прав доступа.

**Основные преимущества:**
- ✅ Автоматизация (админы добавляются из Telegram)
- ✅ Безопасность (режим чтения без email)
- ✅ Гибкость (ручное добавление + приглашения)
- ✅ Прозрачность (отображение групп и custom titles)
- ✅ Контроль (RLS политики на уровне БД)

**Текущие ограничения:**
- ❌ Email service не настроен (коды в логах)
- ❌ Account merging не реализован
- ⚠️ Ручная синхронизация админов
- ⚠️ Глобальные права (не на уровне групп)

Система готова к использованию, но требует настройки email service и дальнейших улучшений для продакшена.

---

**Автор:** AI Assistant  
**Дата обновления:** 2025-10-19

