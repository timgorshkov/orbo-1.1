# План реализации доступа для участников (Members)

## Цель
Создать упрощённый интерфейс для обычных участников организации с доступом к материалам (чтение), событиям (регистрация) и списку участников.

## Архитектура

### 1. Роли пользователей
```typescript
type UserRole = 'owner' | 'admin' | 'member' | 'guest'
```

- **owner**: создатель организации, полный доступ
- **admin**: администратор групп, полный доступ к организации
- **member**: обычный участник, ограниченный доступ
- **guest**: неавторизованный, доступ только к публичным событиям

### 2. Статусы участников (participants)
```sql
participant_status ENUM:
- 'participant'     -- участник организации (есть в Telegram-группах)
- 'event_attendee'  -- участник мероприятий (зарегистрировался на событие)
- 'candidate'       -- кандидат (временный статус)
- 'excluded'        -- исключённый (был удалён из всех групп)
```

### 3. URL структура
Единый интерфейс с адаптацией по ролям:
```
/app/[org]                    -- стартовая страница (адаптивная)
/app/[org]/materials          -- материалы
/app/[org]/materials/[id]     -- конкретный материал
/app/[org]/events             -- события
/app/[org]/events/[id]        -- карточка события
/app/[org]/members            -- участники (карточки)
/app/[org]/members/[id]       -- профиль участника
/app/[org]/dashboard          -- дашборд (только для admin/owner)
/app/[org]/telegram/*         -- настройки Telegram (только для admin/owner)
/app/[org]/settings           -- настройки (только для admin/owner)

/p/[org]/events/[id]          -- публичная страница события (без левого меню)
```

### 4. Левая панель

#### Состояния панели:
- **Collapsed (свёрнутая)**: только иконки + лого организации
- **Expanded (развёрнутая)**: иконки + текст + дерево материалов

#### По умолчанию:
- **Все роли**: expanded (развернутая панель)
- Пользователь может свернуть/развернуть вручную
- Состояние сохраняется в localStorage
- **Mobile**: кнопка меню (гамбургер) - планируется

#### Элементы для members (collapsed):
```
┌─────────────┐
│  [LOGO ORG] │ <- клик = переключатель организаций
│  [↕]        │ <- смена организации
├─────────────┤
│  📄         │ <- Материалы
│  📅         │ <- События
│  👥         │ <- Участники
├─────────────┤
│  ⚙️         │ <- Настройки профиля (не организации)
└─────────────┘
```

#### Элементы для admin/owner (expanded):
```
┌────────────────────────┐
│ [LOGO] Название орг.   │
│ [↕] Сменить            │
├────────────────────────┤
│ 📊 Дашборд             │
│ 📄 Материалы           │
│   ├─ Папка 1           │
│   └─ Папка 2           │
│ 📅 События             │
│ 👥 Участники           │
│ 💬 TELEGRAM ГРУППЫ ⚙️   │
├────────────────────────┤
│ ⚙️ Настройки           │
└────────────────────────┘
```

#### Элементы для member (expanded):
```
┌────────────────────────┐
│ [LOGO] Название орг.   │
│ [↕] Сменить            │
├────────────────────────┤
│ 📄 Материалы           │
│   ├─ Папка 1           │
│   └─ Папка 2           │
│ 📅 События             │
│ 👥 Участники           │
├────────────────────────┤
│                        │ <- Нет настроек
└────────────────────────┘
```
**Отличия:** member не видит Дашборд, Telegram-группы, Настройки

### 5. Определение роли

**Алгоритм:**
```typescript
async function getUserRoleInOrg(userId: UUID, orgId: UUID): Promise<UserRole> {
  // 1. Проверяем memberships (owner/admin)
  const membership = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  
  if (membership?.role === 'owner') return 'owner';
  if (membership?.role === 'admin') return 'admin';
  
  // 2. Проверяем participants (через Telegram-группы)
  const participant = await supabase
    .from('participants')
    .select('participant_status')
    .eq('org_id', orgId)
    .eq('telegram_linked_user_id', userId) // через user_telegram_accounts
    .in('participant_status', ['participant', 'event_attendee'])
    .maybeSingle();
  
  if (participant) return 'member';
  
  // 3. Нет доступа
  return 'guest';
}
```

### 6. Материалы для members

**Режим чтения:**
- Видно всё дерево материалов
- Можно сворачивать/разворачивать папки
- Можно читать содержимое
- НЕ доступно: редактирование, drag'n'drop, меню "три точки"

**Автооткрытие:**
- При первом входе → открывается первая корневая страница
- Если материалов нет → редирект на `/app/[org]/events`
- Если и событий нет → редирект на `/app/[org]/members`

### 7. События для members

**Список событий:**
- **Опубликованные (upcoming)**: `status = 'published'` AND `event_date >= NOW()`, сортировка по дате (ASC)
- **Прошедшие (past)**: последние 3-6 событий с `status = 'completed'`, сортировка по дате (DESC)

**Разделы:**
```
┌─────────────────────────────────┐
│ Предстоящие события             │
├─────────────────────────────────┤
│ [Карточка события 1]            │
│ [Карточка события 2]            │
│ ...                             │
├─────────────────────────────────┤
│ Прошедшие события               │
├─────────────────────────────────┤
│ [Карточка события 3]            │
│ [Карточка события 4]            │
│ ...                             │
└─────────────────────────────────┘
```

**Регистрация на событие:**
1. Проверка авторизации через Telegram
2. Если не авторизован → редирект на Telegram OAuth
3. Если авторизован → проверка существующего участника по `tg_user_id`
4. Если участник не найден → создание нового с `participant_status = 'event_attendee'`
5. Если участник найден → использование существующего (без дублей)
6. Создание записи в `event_registrations`

### 8. Участники для members

**Формат: карточки (grid)**
```
┌───────────────────────────────────────────────┐
│ [Поиск: имя, email, @username]                │
├───────────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │ ФОТО │  │ ФОТО │  │ ФОТО │  │ ФОТО │      │
│  │ Имя  │  │ Имя  │  │ Имя  │  │ Имя  │      │
│  │ @tg  │  │ @tg  │  │ @tg  │  │ @tg  │      │
│  └──────┘  └──────┘  └──────┘  └──────┘      │
│  ┌──────┐  ┌──────┐  ...                     │
│  │ ФОТО │  │ ФОТО │                           │
│  │ Имя  │  │ Имя  │                           │
│  │ @tg  │  │ @tg  │                           │
│  └──────┘  └──────┘                           │
└───────────────────────────────────────────────┘
```

**Клик по карточке → модальное окно профиля:**
```
┌─────────────────────────────────┐
│         [ФОТО ПРОФИЛЯ]          │
│      Полное имя участника       │
├─────────────────────────────────┤
│ Telegram:      @username        │
│ Email:         email@example.com│
│ Город:         Москва           │ <- кастомные атрибуты
│ Специализация: Design           │
│ ...                             │
└─────────────────────────────────┘
```

**НЕ показывать:**
- `activity_score`, `risk_score`
- `participant_status` (видно только админам)
- Аналитику активности

### 9. Переключатель организаций

**Список организаций:**
```typescript
interface OrgWithRole {
  id: string;
  name: string;
  logo_url: string | null;
  role: UserRole;
}

// Сортировка: owner/admin сверху (жирным), member ниже
```

**Визуальное представление:**
```
┌────────────────────────────┐
│ Мои организации            │
├────────────────────────────┤
│ **[LOGO] Орг 1** (Владелец)│ <- жирный шрифт
│ **[LOGO] Орг 2** (Админ)   │
│ [LOGO] Орг 3 (Участник)    │
│ [LOGO] Орг 4 (Участник)    │
└────────────────────────────┘
```

### 10. Telegram авторизация для регистрации

**Flow для высокой конверсии:**

1. **Публичное событие без авторизации:**
   - URL: `/p/[org]/events/[id]`
   - Показывается только карточка события, без левого меню
   - Кнопка "Зарегистрироваться" → Telegram OAuth

2. **Telegram OAuth redirect:**
   ```
   /auth/telegram/callback?event_id=[id]&org_id=[org]
   ```

3. **После успешной авторизации:**
   - Проверка существования участника по `tg_user_id`
   - Создание/обновление участника
   - Регистрация на событие
   - Редирект обратно на страницу события с сообщением "Вы зарегистрированы!"

4. **Упрощённый интерфейс авторизации:**
   - Минимум полей (только Telegram)
   - Автоматическое получение данных из Telegram (имя, фото)
   - Одна кнопка "Войти через Telegram"

### 11. Логика исключения участников

**Триггер на изменение `participant_groups`:**
```sql
CREATE OR REPLACE FUNCTION check_participant_exclusion()
RETURNS TRIGGER AS $$
BEGIN
  -- Если участника удалили из группы
  IF (TG_OP = 'DELETE') THEN
    -- Проверяем, остался ли он хотя бы в одной группе организации
    PERFORM 1
    FROM participant_groups pg
    JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_chat_id
    WHERE pg.participant_id = OLD.participant_id
      AND tg.org_id = (
        SELECT org_id FROM telegram_groups WHERE tg_chat_id = OLD.tg_chat_id
      )
    LIMIT 1;
    
    -- Если не нашли ни одной группы → меняем статус на 'excluded'
    IF NOT FOUND THEN
      UPDATE participants
      SET participant_status = 'excluded',
          updated_at = NOW()
      WHERE id = OLD.participant_id
        AND participant_status = 'participant';
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_participant_exclusion
AFTER DELETE ON participant_groups
FOR EACH ROW
EXECUTE FUNCTION check_participant_exclusion();
```

**Обратная логика (восстановление):**
```sql
-- При добавлении в группу обратно → меняем статус с 'excluded' на 'participant'
CREATE OR REPLACE FUNCTION restore_participant_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE participants
  SET participant_status = 'participant',
      updated_at = NOW()
  WHERE id = NEW.participant_id
    AND participant_status = 'excluded';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_restore_participant_status
AFTER INSERT ON participant_groups
FOR EACH ROW
EXECUTE FUNCTION restore_participant_status();
```

## План миграции БД

### Migration 22: Member Access & Participant Statuses

1. **Добавить ENUM для статусов участников:**
```sql
CREATE TYPE participant_status_enum AS ENUM (
  'participant',
  'event_attendee',
  'candidate',
  'excluded'
);

ALTER TABLE participants
ADD COLUMN IF NOT EXISTS participant_status participant_status_enum DEFAULT 'participant';

-- Заполнить для существующих участников
UPDATE participants
SET participant_status = 'participant'
WHERE participant_status IS NULL;
```

2. **Обновить RLS политики для participants:**
```sql
-- Members могут видеть всех участников своей организации
CREATE POLICY "Members can view org participants"
ON participants FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM memberships WHERE user_id = auth.uid()
    UNION
    SELECT tg.org_id
    FROM participant_groups pg
    JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_chat_id
    JOIN participants p ON p.id = pg.participant_id
    JOIN user_telegram_accounts uta ON uta.tg_user_id = p.tg_user_id
    WHERE uta.user_id = auth.uid()
  )
);
```

3. **Добавить функцию определения роли:**
```sql
CREATE OR REPLACE FUNCTION get_user_role_in_org(p_user_id UUID, p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Проверяем memberships
  SELECT role INTO v_role
  FROM memberships
  WHERE user_id = p_user_id AND org_id = p_org_id
  LIMIT 1;
  
  IF v_role IN ('owner', 'admin') THEN
    RETURN v_role;
  END IF;
  
  -- Проверяем участие через Telegram-группы
  PERFORM 1
  FROM participants p
  JOIN participant_groups pg ON pg.participant_id = p.id
  JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_chat_id
  JOIN user_telegram_accounts uta ON uta.tg_user_id = p.tg_user_id
  WHERE uta.user_id = p_user_id
    AND tg.org_id = p_org_id
    AND p.participant_status IN ('participant', 'event_attendee')
  LIMIT 1;
  
  IF FOUND THEN
    RETURN 'member';
  END IF;
  
  RETURN 'guest';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

4. **Добавить триггеры для автоматического изменения статуса:**
```sql
-- см. раздел "Логика исключения участников" выше
```

## Компоненты для создания

### 1. Левая панель
- `components/navigation/collapsible-sidebar.tsx` - сворачиваемая панель
- `components/navigation/org-logo.tsx` - лого организации
- `components/navigation/org-switcher-enhanced.tsx` - улучшенный переключатель

### 2. Материалы
- `components/materials/materials-tree-readonly.tsx` - дерево только для чтения
- `app/app/[org]/materials-member.tsx` - обёртка для members

### 3. События
- `components/events/events-list-member.tsx` - список для members (upcoming + past)
- `components/events/event-registration-flow.tsx` - Telegram OAuth flow

### 4. Участники
- `components/members/members-grid.tsx` - сетка карточек
- `components/members/member-card.tsx` - карточка участника
- `components/members/member-profile-modal.tsx` - модальное окно профиля
- `components/members/member-search.tsx` - поиск

### 5. Утилиты
- `lib/auth/getUserRole.ts` - определение роли
- `lib/auth/redirectByRole.ts` - редирект на стартовую страницу
- `lib/participants/checkDuplicates.ts` - проверка дублей при регистрации

## Тестирование

### Сценарии:
1. **Admin → Member**: входит в организацию, где он участник → видит свернутую панель
2. **Member → Admin**: становится админом группы → панель разворачивается
3. **Публичное событие**: неавторизованный пользователь регистрируется через Telegram
4. **Дубли участников**: регистрация существующего участника не создаёт дубль
5. **Исключение**: удаление из всех групп → статус 'excluded'
6. **Восстановление**: добавление обратно в группу → статус 'participant'

## Приоритеты MVP

**Фаза 1 (критично):**
- Миграция БД (статусы, RLS)
- Сворачиваемая панель
- Адаптация материалов (режим чтения)
- Базовый список событий для members

**Фаза 2 (важно):**
- Telegram OAuth для регистрации
- Проверка дублей участников
- Карточный интерфейс участников

**Фаза 3 (можно позже):**
- Автоматическое изменение статусов
- Мобильная адаптация
- Профиль участника (модальное окно)

---

**Статус**: Готов к реализации
**Дата создания**: 2025-10-09

