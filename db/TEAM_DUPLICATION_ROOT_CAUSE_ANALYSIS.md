# Анализ корневой причины дублирования администраторов

## 🔍 Исследование 4 критических мест

---

## 1️⃣ КАК ПОЯВЛЯЮТСЯ ДУБЛИ?

### 🔴 **КРИТИЧЕСКАЯ ПРОБЛЕМА НАЙДЕНА!**

**Файл:** `db/migrations/54_sync_telegram_admins_without_account.sql`
**Функция:** `sync_telegram_admins(p_org_id UUID)`

### Корневая причина дублирования:

Функция `sync_telegram_admins` создаёт **НОВЫЙ** `user_id` в `auth.users` для каждого админа из Telegram группы, **ДАЖЕ ЕСЛИ** этот Telegram пользователь уже имеет аккаунт в системе!

#### Логика работы (строки 32-93):

```sql
FOR v_admin_record IN (
  SELECT tga.tg_user_id, tga.user_telegram_account_id
  FROM telegram_group_admins tga
  ...
) LOOP
  
  -- Сценарий 1: Есть user_telegram_account_id
  IF v_admin_record.user_telegram_account_id IS NOT NULL THEN
    -- ✅ Берёт существующий user_id
    SELECT user_id INTO v_user_id FROM user_telegram_accounts ...
    
  -- Сценарий 2: НЕТ user_telegram_account_id
  ELSE
    -- Ищет participant по tg_user_id
    SELECT * INTO v_participant FROM participants p
    WHERE p.tg_user_id = v_admin_record.tg_user_id ...
    
    IF v_participant.user_id IS NOT NULL THEN
      -- ✅ Использует существующий user_id
      v_user_id := v_participant.user_id;
    ELSE
      -- ❌❌❌ ПРОБЛЕМА: Создаёт НОВЫЙ shadow user!
      INSERT INTO auth.users (...) VALUES (
        gen_random_uuid(),  -- НОВЫЙ user_id!
        NULL,              -- БЕЗ email
        ...
      )
      RETURNING id INTO v_user_id;
      
      -- И обновляет participant этим НОВЫМ user_id
      UPDATE participants p SET user_id = v_user_id ...
    END IF;
  END IF;
END LOOP;
```

### Сценарий дублирования (ваш случай):

1. **Владелец (Tim Gorshkov):**
   - Зарегистрировался → создан `user_id: 9bb4b601...` + `membership: owner`
   - Добавил бота в группу Test2
   - Бот видит его как `administrator` в группе
   
2. **Синхронизация админов:**
   - `update-admin-rights` собирает список админов из Bot API
   - Создаёт записи в `telegram_group_admins` для Tim (tg_user_id: 154588486)
   
3. **Вызов `sync_telegram_admins`:**
   - Находит админа Tim в `telegram_group_admins`
   - `user_telegram_account_id IS NULL` (потому что он еще не авторизовался через Telegram для этой org!)
   - Находит `participant` для tg_user_id: 154588486
   - `participant.user_id IS NULL` (потому что participant создан через group message, а не через авторизацию)
   - **❌ СОЗДАЁТ НОВЫЙ shadow user:** `aaa800d9...`
   - **❌ СОЗДАЁТ НОВЫЙ membership:** `role: admin, user_id: aaa800d9...`
   
4. **Результат:**
   - Tim имеет **2 user_id**: `9bb4b601` (owner) и `aaa800d9` (admin-shadow)
   - На странице настроек: owner + admin (дубль!)

### Почему это происходит:

**Отсутствует проверка на существующий `user_id` по `tg_user_id` в других организациях!**

Функция проверяет только:
1. `user_telegram_accounts` для текущей организации
2. `participants` для текущей организации

Но **НЕ проверяет:**
- Есть ли у этого `tg_user_id` **глобальная** запись в `user_telegram_accounts` (в другой организации)?
- Есть ли у этого `tg_user_id` **глобальная** запись в `participants` с `user_id` (в другой организации)?

---

## 2️⃣ ПОДГРУЗКА УЧАСТНИКОВ-АДМИНОВ ИЗ TELEGRAM

### Процесс обновления прав администраторов:

#### Триггеры (когда происходит):

**A) Кнопка "Обновить права администраторов"**
- **Страница:** `/app/[org]/telegram/account` (строка 424)
- **API:** `POST /api/telegram/groups/update-admins`
- **Кто может:** Любой пользователь с верифицированным Telegram

**B) Кнопка "Синхронизировать с Telegram"**
- **Страница:** `/app/[org]/settings` → "Команда организации"
- **API:** `POST /api/organizations/[id]/team`
- **Кто может:** Только owner или admin

#### Логика `/api/telegram/groups/update-admin-rights`:

**Файл:** `app/api/telegram/groups/update-admin-rights/route.ts`

```typescript
export async function POST(request: Request) {
  // 1. Получаем текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();
  
  // 2. Получаем все verified Telegram accounts для этого user_id
  const { data: telegramAccounts } = await supabaseService
    .from('user_telegram_accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_verified', true);
  
  // 3. Собираем все группы организации
  const { data: candidateGroups } = await supabaseService
    .from('org_telegram_groups')
    .select('tg_chat_id')
    .eq('org_id', orgId);
  
  // 4. ДЛЯ КАЖДОЙ ГРУППЫ вызываем Telegram Bot API
  for (const chatId of candidateChatIds) {
    const admins = await telegram.getChatAdministrators(chatId);
    
    // 5. ДЛЯ КАЖДОГО АДМИНА создаём/обновляем telegram_group_admins
    for (const admin of admins) {
      // Ищем user_telegram_account_id по tg_user_id
      const account = await findAccountByTgUserId(admin.user.id);
      
      await supabaseService
        .from('telegram_group_admins')
        .upsert({
          tg_chat_id: chatId,
          tg_user_id: admin.user.id,
          user_telegram_account_id: account?.id || null,  // ❗ Может быть NULL!
          status: admin.status,
          is_admin: true,
          is_owner: admin.status === 'creator',
          custom_title: admin.custom_title,
          expires_at: NOW() + 30 days  // Права актуальны 30 дней
        });
    }
  }
  
  // 6. НЕ вызывает sync_telegram_admins автоматически!
  // Нужно вызвать отдельно через кнопку "Синхронизировать"
  
  return { updated, total };
}
```

### ⚠️ **Критические моменты:**

1. **`update-admin-rights` ТОЛЬКО обновляет `telegram_group_admins`**
   - Не создаёт memberships
   - Не создаёт shadow users
   - Просто сохраняет список админов из Telegram API

2. **`sync_telegram_admins` вызывается ОТДЕЛЬНО**
   - Через кнопку "Синхронизировать с Telegram"
   - Именно эта функция создаёт memberships и shadow users

3. **`user_telegram_account_id` может быть `NULL`**
   - Если админ ещё не авторизовался через Telegram для этой организации
   - **ЭТО ЗАПУСКАЕТ СОЗДАНИЕ SHADOW USER!**

---

## 3️⃣ ОБНОВЛЕНИЕ ПРАВ ПРИ УДАЛЕНИИ АДМИНА В TELEGRAM

### Логика удаления прав:

**Файл:** `db/migrations/54_sync_telegram_admins_without_account.sql` (строки 236-264)

```sql
-- Удаляем админов, потерявших права
DELETE FROM memberships m
WHERE 
  m.org_id = p_org_id
  AND m.role IN ('admin', 'owner')
  AND m.role_source = 'telegram_admin'  -- ❗ ВАЖНО: только те, кто получил права через Telegram
  AND NOT EXISTS (
    SELECT 1 
    FROM telegram_group_admins tga
    WHERE 
      tga.tg_user_id = (
        SELECT p.tg_user_id FROM participants p WHERE p.user_id = m.user_id
      )
      AND tga.is_admin = true
      AND tga.expires_at > NOW()  -- ❗ Проверяет актуальность (30 дней)
  )
RETURNING m.user_id;
```

### ✅ **Работает правильно:**

1. Удаляет membership **ТОЛЬКО** если:
   - `role_source = 'telegram_admin'` (получен через синхронизацию)
   - Админ больше не найден в `telegram_group_admins` с актуальными правами

2. **НЕ удаляет:**
   - Owner с `role_source != 'telegram_admin'` (вручную созданный)
   - Admin с `role_source = 'manual'` или `'invitation'`

### ⚠️ **Проблема:** Требует ручной синхронизации!

- Права НЕ обновляются автоматически при изменениях в Telegram
- Нужно:
  1. Нажать "Обновить права администраторов" (обновит `telegram_group_admins`)
  2. Нажать "Синхронизировать с Telegram" (удалит memberships)

### Периодичность:

- `telegram_group_admins.expires_at` = 30 дней
- Если не обновлять, через 30 дней админ автоматически потеряет права (при след. синхронизации)

---

## 4️⃣ ЛОГИКА АВТОРИЗАЦИИ ЧЕРЕЗ TELEGRAM

### A) Telegram авторизация для доступа к материалам/событиям

**Файлы:**
- `lib/services/telegramAuthService.ts` (основная логика)
- `app/auth/telegram/route.ts` (endpoint)

#### Процесс авторизации:

```typescript
export async function verifyTelegramAuthCode(params: VerifyCodeParams) {
  // 1. Проверяем код
  const authCode = await fetchAuthCode(params.code);
  
  // 2. Связываем код с Telegram user_id
  await updateCode(authCode.id, { telegram_user_id, telegram_username });
  
  // 3. ❗ КРИТИЧЕСКИЙ МОМЕНТ: Поиск существующего пользователя
  const existingAccounts = await supabaseFetch(
    `user_telegram_accounts?telegram_user_id=eq.${telegramUserId}&select=user_id`
  );
  
  const existingAccount = existingAccounts?.[0];
  
  if (existingAccount) {
    // ✅ Используем существующий user_id
    userId = existingAccount.user_id;
  } else {
    // ❌ Создаём НОВЫЙ user с email telegram_XXX@orbo.temp
    const email = `telegram_${telegramUserId}@orbo.temp`;
    const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: { telegram_user_id, telegram_username, ... }
    });
    userId = newUser.user.id;
  }
  
  // 4. Создаём/обновляем participant
  const participant = await findOrCreateParticipant(targetOrgId, telegramUserId, userId);
  
  // 5. ❗ Создаём user_telegram_accounts
  await supabaseFetch('user_telegram_accounts', {
    method: 'POST',
    body: {
      user_id: userId,
      org_id: targetOrgId,
      telegram_user_id: telegramUserId,
      telegram_username,
      is_verified: true
    }
  });
  
  // 6. Входим в аккаунт
  return { success: true, authLink: `...?access_token=...` };
}
```

### ✅ **Работает правильно:**

Поиск существующего пользователя идёт **глобально** по `telegram_user_id`:
```sql
SELECT user_id FROM user_telegram_accounts 
WHERE telegram_user_id = XXX
-- БЕЗ фильтра по org_id!
```

Это предотвращает создание дублей при авторизации.

### ⚠️ **НО! Проблема в последовательности:**

1. Если пользователь **СНАЧАЛА** стал админом в группе → `sync_telegram_admins` создаёт shadow user
2. Если пользователь **ПОТОМ** авторизуется → `telegramAuthService` создаёт ещё один user

**Результат:** 2 user_id для одного tg_user_id!

---

## 📊 РЕЗЮМЕ: ЧТО НЕ ТАК

### 🔴 Критические проблемы:

1. **`sync_telegram_admins` не проверяет глобально `user_telegram_accounts`**
   - Создаёт shadow user, даже если пользователь уже зарегистрирован
   - НЕ ищет `user_id` по `tg_user_id` в других организациях

2. **Нет единого источника истины для `tg_user_id` → `user_id` маппинга**
   - `telegramAuthService` ищет глобально
   - `sync_telegram_admins` ищет только в текущей организации
   - **Разная логика приводит к дублям!**

3. **`participant.user_id` может быть `NULL`**
   - Если participant создан через `eventProcessingService` (message в группе)
   - `sync_telegram_admins` воспринимает это как "нет пользователя" → создаёт shadow

4. **Синхронизация не автоматическая**
   - Требует ручных кликов по кнопкам
   - Между обновлением `telegram_group_admins` и вызовом `sync_telegram_admins` может быть задержка

---

## 🛠️ РЕШЕНИЕ

Создам отдельный документ с полным планом исправления...


