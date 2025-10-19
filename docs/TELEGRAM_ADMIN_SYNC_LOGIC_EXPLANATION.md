# Как пользователь попадает в роль администратора из Telegram

## 🔍 Ваш вопрос

**Org ID:** `d7e2e580-6b3d-42e2-bee0-4846794f07ee`  
**User ID:** `8dd6c125-49c7-4970-a365-52eff536ce9c`

В базе данных есть запись в `memberships`:
- `role` = `admin`
- `role_source` = `telegram_admin`

Но:
- ❌ В профиле показывается "Telegram не привязан"
- ❌ Владелец вручную ничего не добавлял
- ❓ Как пользователь мог попасть в эту роль?

## 🎯 Ответ: Автоматическая синхронизация Telegram админов

Пользователь попал в роль администратора **автоматически** через механизм синхронизации Telegram групп.

## 📋 Полная логика по шагам

### Шаг 1: Пользователь был админом в Telegram группе

1. **Где-то в прошлом** этот пользователь был администратором в Telegram группе
2. Эта группа была подключена к организации `d7e2e580-6b3d-42e2-bee0-4846794f07ee`
3. У пользователя был привязан и верифицирован Telegram аккаунт

### Шаг 2: Кто-то вызвал синхронизацию

Синхронизация может быть вызвана несколькими способами:

#### А) Через страницу настройки Telegram аккаунта
**Страница:** `/app/[org]/telegram/account`

**Кнопка:** "Обновить права администраторов"

**Код:** `app/app/[org]/telegram/account/page.tsx` (строки 230-268)

```tsx
const handleUpdateAdminRights = async () => {
  setSyncing(true)
  setSyncResult(null)
  setError(null)
  
  try {
    // 1. Вызывается API endpoint
    const response = await fetch('/api/telegram/groups/update-admins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orgId: params.org  // ID организации
      }),
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update admin rights')
    }
    
    setSyncResult(`Обновлены права администраторов: ${data.updated} из ${data.total}`)
  } catch (e: any) {
    console.error('Error updating admin rights:', e)
    setError(e.message || 'Failed to update admin rights')
  } finally {
    setSyncing(false)
  }
}
```

**Кто может нажать:** Любой пользователь с верифицированным Telegram аккаунтом в организации.

#### Б) Через страницу "Команда организации"
**Страница:** `/app/[org]/settings` → "Команда организации"

**Кнопка:** "Синхронизировать с Telegram"

**Код:** `components/settings/organization-team.tsx` (строки 35-75)

```tsx
const handleSync = async () => {
  setSyncing(true)
  setSyncMessage(null)
  try {
    // Вызывается API endpoint
    const response = await fetch(`/api/organizations/${organizationId}/team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    const data = await response.json()
    if (data.success) {
      setSyncMessage('✅ Синхронизация завершена успешно')
      loadTeam() // Перезагружаем список команды
    } else {
      setSyncMessage('❌ Ошибка синхронизации: ' + (data.error || 'Неизвестная ошибка'))
    }
  } catch (error: any) {
    setSyncMessage('❌ Ошибка синхронизации: ' + error.message)
  } finally {
    setSyncing(false)
  }
}
```

**Кто может нажать:** Только владелец организации.

### Шаг 3: API проверяет права администратора

**Endpoint:** `POST /api/telegram/groups/update-admins`

**Файл:** `app/api/telegram/groups/update-admins/route.ts`

**Что происходит:**

1. **Получает все верифицированные Telegram аккаунты текущего пользователя** (строки 36-62):
   ```typescript
   const { data: accounts } = await supabaseService
     .from('user_telegram_accounts')
     .select('*')
     .eq('user_id', user.id)  // Текущий пользователь, который нажал кнопку
     .eq('is_verified', true);
   ```

2. **Получает все Telegram группы организации** (строки 64-116):
   ```typescript
   const { data: orgGroups } = await supabaseService
     .from('org_telegram_groups')
     .select(`telegram_groups!inner(*)`)
     .eq('org_id', orgId);
   ```

3. **Для КАЖДОГО аккаунта и КАЖДОЙ группы проверяет права через Telegram Bot API** (строки 122-235):
   ```typescript
   for (const account of accounts) {
     for (const group of groups) {
       // Вызов Telegram API
       const adminInfo = await telegramService.getChatMember(
         Number(group.tg_chat_id), 
         Number(account.telegram_user_id)
       );
       
       const isAdmin = member.status === 'administrator' || member.status === 'creator';
       
       if (isAdmin) {
         // Сохраняет в telegram_group_admins
         await supabaseService
           .from('telegram_group_admins')
           .upsert({
             tg_chat_id: group.tg_chat_id,
             tg_user_id: account.telegram_user_id,
             user_telegram_account_id: account.id,
             is_admin: true,
             expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 дней
             // ... другие поля
           });
       }
     }
   }
   ```

4. **Вызывает функцию синхронизации memberships** (строки 237-246):
   ```typescript
   await supabaseService
     .rpc('sync_telegram_admins', { p_org_id: orgId });
   ```

### Шаг 4: Функция `sync_telegram_admins` создает memberships

**Файл:** `db/migrations/46_sync_telegram_admins_with_shadow_profiles.sql`

**Что делает:**

1. **Находит всех админов из telegram_group_admins** (строки 30-47):
   ```sql
   SELECT DISTINCT
     uta.user_id AS admin_user_id,
     uta.telegram_user_id,
     ARRAY_AGG(DISTINCT tg.id) as group_ids,
     ARRAY_AGG(DISTINCT tg.title) as group_titles
   FROM telegram_group_admins tga
   INNER JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
   INNER JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
   INNER JOIN org_telegram_groups otg ON otg.tg_chat_id = tg.tg_chat_id
   WHERE 
     otg.org_id = p_org_id
     AND tga.is_admin = true
     AND uta.is_verified = true
     AND tga.expires_at > NOW()
   GROUP BY uta.user_id, uta.telegram_user_id
   ```

2. **Для каждого админа проверяет email** (строки 51-55):
   ```sql
   SELECT (email IS NOT NULL AND email_confirmed_at IS NOT NULL)
   INTO v_has_email
   FROM auth.users
   WHERE id = v_user_id;
   ```

3. **Создает или обновляет membership** (строки 62-140):
   ```sql
   -- Если membership не существует - создаем
   INSERT INTO memberships (org_id, user_id, role, role_source, metadata)
   VALUES (
     p_org_id,
     v_user_id,
     'admin',
     'telegram_admin',  -- <-- ВОТ ОТКУДА role_source
     jsonb_build_object(
       'telegram_groups', v_admin_record.group_ids,
       'telegram_group_titles', v_admin_record.group_titles,
       'shadow_profile', NOT v_has_email,
       'synced_at', NOW()
     )
   );
   ```

## 🎭 Сценарий: Как это произошло у вас

### Вероятный сценарий:

1. **В прошлом:**
   - Пользователь `8dd6c125-49c7-4970-a365-52eff536ce9c` создал и верифицировал Telegram аккаунт в вашей организации
   - У него был email и подтвержденная почта
   - Он был назначен администратором в какой-то Telegram группе, подключенной к организации

2. **Кто-то нажал "Обновить права администраторов":**
   - Это мог быть владелец организации
   - Это мог быть сам этот пользователь (когда у него еще был привязан Telegram)
   - Это мог быть любой другой пользователь с верифицированным Telegram

3. **Система нашла его в Telegram группе как админа:**
   - Запросила у Telegram Bot API: "Кто администраторы в этой группе?"
   - Telegram ответил: "В том числе пользователь с ID XYZ"
   - Система нашла, что это `user_id = 8dd6c125-49c7-4970-a365-52eff536ce9c`

4. **Система создала membership:**
   - `role = admin`
   - `role_source = telegram_admin`
   - `shadow_profile = false` (потому что у пользователя был email)

5. **Позже пользователь отвязал Telegram:**
   - Удалил запись в `user_telegram_accounts`
   - НО membership остался!
   - Функция `sync_telegram_admins` удаляет memberships только если:
     - `expires_at` прошел (прошло больше 7 дней)
     - ИЛИ админ больше не найден в Telegram группах

## 🔍 Как проверить, что произошло

### Запрос 1: Проверить membership

```sql
SELECT 
  m.user_id, 
  m.role, 
  m.role_source, 
  m.created_at,
  m.metadata->'synced_at' as last_synced,
  m.metadata->'telegram_groups' as telegram_groups,
  m.metadata->'shadow_profile' as was_shadow
FROM memberships m
WHERE 
  m.org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee' 
  AND m.user_id = '8dd6c125-49c7-4970-a365-52eff536ce9c';
```

**Что покажет:**
- Когда был создан membership (`created_at`)
- Когда последний раз синхронизировался (`last_synced`)
- В каких группах был админом (`telegram_groups`)
- Был ли теневым профилем (`was_shadow`)

### Запрос 2: Проверить Telegram аккаунт

```sql
SELECT 
  uta.id,
  uta.telegram_user_id,
  uta.telegram_username,
  uta.is_verified,
  uta.verified_at,
  uta.created_at
FROM user_telegram_accounts uta
WHERE 
  uta.user_id = '8dd6c125-49c7-4970-a365-52eff536ce9c'
  AND uta.org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee';
```

**Что покажет:**
- Есть ли сейчас привязанный Telegram аккаунт
- Если нет - значит был удален

### Запрос 3: Проверить историю администрирования

```sql
SELECT 
  tga.tg_chat_id,
  tg.title as group_title,
  tga.tg_user_id,
  tga.is_admin,
  tga.verified_at,
  tga.expires_at,
  uta.user_id
FROM telegram_group_admins tga
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = tga.tg_chat_id
LEFT JOIN user_telegram_accounts uta ON uta.id = tga.user_telegram_account_id
WHERE 
  uta.user_id = '8dd6c125-49c7-4970-a365-52eff536ce9c'
ORDER BY tga.verified_at DESC;
```

**Что покажет:**
- В каких группах был админом
- Когда истекает запись (`expires_at`)
- Если `expires_at` уже прошел - запись устарела

### Запрос 4: Найти, когда была последняя синхронизация

```sql
-- Этот запрос НЕ РАБОТАЕТ, т.к. нет таблицы логов
-- Но можно посмотреть metadata в memberships
SELECT 
  m.metadata->'synced_at' as last_sync_time,
  m.metadata->'telegram_groups' as groups,
  m.created_at as membership_created
FROM memberships m
WHERE 
  m.org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
  AND m.role_source = 'telegram_admin'
ORDER BY (m.metadata->>'synced_at')::timestamp DESC;
```

## 🔧 Что делать сейчас

### Вариант 1: Оставить как есть

Если пользователь действительно был админом в Telegram группе, и у него есть email - это корректное поведение.

### Вариант 2: Удалить membership вручную

Если вы считаете, что это ошибка:

```sql
DELETE FROM memberships
WHERE 
  org_id = 'd7e2e580-6b3d-42e2-bee0-4846794f07ee'
  AND user_id = '8dd6c125-49c7-4970-a365-52eff536ce9c'
  AND role_source = 'telegram_admin';
```

### Вариант 3: Изменить логику синхронизации

Если хотите, чтобы membership удалялся при отвязке Telegram:

**Нужно добавить проверку в функцию `sync_telegram_admins`:**

```sql
-- Удалять админов, у которых НЕТ активного Telegram аккаунта
DELETE FROM memberships m
WHERE 
  m.org_id = p_org_id
  AND m.role = 'admin'
  AND m.role_source = 'telegram_admin'
  AND NOT EXISTS (
    SELECT 1 
    FROM user_telegram_accounts uta
    WHERE uta.user_id = m.user_id
      AND uta.org_id = p_org_id
      AND uta.is_verified = true
  );
```

## 📊 Краткая схема

```
┌─────────────────────────────────────────────────────┐
│ 1. Пользователь создает и верифицирует Telegram    │
│    аккаунт в организации                            │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 2. Пользователь становится админом в Telegram       │
│    группе, подключенной к организации               │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. Кто-то нажимает "Обновить права администраторов"│
│    или "Синхронизировать с Telegram"                │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 4. Система запрашивает у Telegram Bot API:         │
│    "Кто админы в этой группе?"                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 5. Система находит пользователя и сохраняет в      │
│    telegram_group_admins                            │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 6. Функция sync_telegram_admins создает membership: │
│    - role = admin                                   │
│    - role_source = telegram_admin                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 7. Пользователь отвязывает Telegram                │
│    (удаляет user_telegram_accounts)                 │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 8. Membership ОСТАЕТСЯ, потому что:                 │
│    - expires_at еще не прошел (7 дней)             │
│    - ИЛИ никто не вызвал повторную синхронизацию    │
└─────────────────────────────────────────────────────┘
```

## ✅ Итого

**Ответ на ваш вопрос:**

Пользователь попал в роль администратора автоматически, потому что:

1. ✅ У него БЫЛ привязанный и верифицированный Telegram аккаунт
2. ✅ Он БЫЛ администратором в Telegram группе, подключенной к организации
3. ✅ Кто-то вызвал синхронизацию (нажал кнопку)
4. ✅ Система автоматически создала membership с `role_source = telegram_admin`
5. ❌ ПОТОМ он отвязал Telegram, но membership остался

**Это не баг, это фича!** 😊

Система разработана так, чтобы автоматически синхронизировать права администраторов из Telegram групп.

Если хотите изменить логику - смотрите "Вариант 3" выше.

