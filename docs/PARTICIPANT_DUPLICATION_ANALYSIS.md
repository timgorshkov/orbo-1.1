# Анализ дублирования участников (Participants)

## 🔍 Места создания участников в коде

### 1. **EventProcessingService.processNewMembers** ⚠️
**Файл**: `lib/services/eventProcessingService.ts` (строки 550-567)  
**Триггер**: Присоединение нового участника к Telegram группе

```typescript
const { data: participant } = await this.supabase
  .from('participants')
  .select('...')
  .eq('tg_user_id', member.id)
  .eq('org_id', orgId)
  .maybeSingle()

if (!participant) {
  // Создаем нового участника
  await this.supabase.from('participants').insert({...})
}
```

**Логика проверки**: `org_id + tg_user_id`  
**Статус**: ✅ Корректно (один tg_user_id на организацию)

---

### 2. **EventProcessingService.processUserMessage** ⚠️
**Файл**: `lib/services/eventProcessingService.ts` (строки 758-774)  
**Триггер**: Первое сообщение пользователя в Telegram группе

```typescript
const { data: participant } = await this.supabase
  .from('participants')
  .select('...')
  .eq('tg_user_id', userId)
  .eq('org_id', orgId)
  .maybeSingle()

if (!participant) {
  console.log(`Creating new participant...`)
  await this.supabase.from('participants').insert({...})
}
```

**Логика проверки**: `org_id + tg_user_id`  
**Статус**: ✅ Корректно

---

### 3. ❌ **app/api/events/[id]/register/route.ts** - ОСНОВНАЯ ПРОБЛЕМА
**Файл**: `app/api/events/[id]/register/route.ts` (строки 53-104)  
**Триггер**: Регистрация на событие через веб-интерфейс

```typescript
// Ищем Telegram аккаунт пользователя
const { data: telegramAccount } = await supabase
  .from('user_telegram_accounts')
  .select('telegram_user_id')
  .eq('user_id', user.id)
  .eq('org_id', event.org_id)
  .maybeSingle()

// Ищем participant по telegram_user_id
if (telegramAccount?.telegram_user_id) {
  const { data: foundParticipant } = await adminSupabase
    .from('participants')
    .select('id')
    .eq('org_id', event.org_id)
    .eq('tg_user_id', telegramAccount.telegram_user_id)
    .is('merged_into', null)
    .maybeSingle()
  
  participant = foundParticipant
}

// Если не нашли - СОЗДАЕМ НОВОГО!
if (!participant) {
  console.log(`Creating new participant...`)
  
  const { data: newParticipant } = await adminSupabase
    .from('participants')
    .insert({
      org_id: event.org_id,
      tg_user_id: telegramAccount?.telegram_user_id || null, // ⚠️ может быть NULL!
      full_name: user.email || 'Unknown',
      email: user.email,
      source: 'event',
      participant_status: 'event_attendee'
    })
    .select('id')
    .single()
  
  participant = newParticipant
}
```

**Проблема**: 
1. Если у пользователя НЕТ подтвержденного Telegram аккаунта → `telegramAccount` = null
2. Поиск participant не выполняется (пропускается блок `if`)
3. **КАЖДАЯ регистрация создает НОВОГО participant** с `tg_user_id = null` и `email = user.email`

**Сценарий дублирования**:
```
1. Пользователь регистрируется на событие 1 → создается participant #1
2. Пользователь регистрируется на событие 2 → создается participant #2
3. Пользователь регистрируется на событие 3 → создается participant #3
... и так далее для каждого события!
```

**Статус**: ❌ **КРИТИЧЕСКАЯ ПРОБЛЕМА** - источник массового дублирования

---

### 4. **telegramAuthService.verifyTelegramAuthCode** ⚠️
**Файл**: `lib/services/telegramAuthService.ts` (строки 284-316)  
**Триггер**: Авторизация через Telegram код (для событий)

```typescript
// Проверяем существующего participant
const existingParticipants = await supabaseFetch(
  `participants?org_id=eq.${targetOrgId}&user_id=eq.${userId}&select=id`
)

if (Array.isArray(existingParticipants) && existingParticipants.length > 0) {
  participantId = existingParticipants[0].id
} else {
  // Создаем нового
  const newParticipants = await supabaseFetch('participants', {
    method: 'POST',
    body: JSON.stringify({
      org_id: targetOrgId,
      user_id: userId, // ⚠️ но у participants нет поля user_id!
      full_name: `${firstName || ''} ${lastName || ''}`.trim(),
      tg_user_id: String(telegramUserId),
      username: telegramUsername,
      participant_status: 'participant',
      source: 'telegram'
    })
  })
}
```

**Проблема**:
1. В таблице `participants` **НЕТ** колонки `user_id` (только `tg_user_id`)
2. Проверка `user_id=eq.${userId}` всегда возвращает пустой массив
3. Каждый раз создается новый participant

**Статус**: ❌ **ПРОБЛЕМА** - дубли при Telegram-авторизации

---

## 📊 Типы дублирования

### Тип 1: Множественные регистрации на события
**Причина**: Отсутствие проверки по `email` или созданного ранее participant  
**Пример**:
```sql
SELECT * FROM participants 
WHERE email = 'user@example.com' AND tg_user_id IS NULL;

-- Результат:
id                                   | org_id  | email              | source
-------------------------------------|---------|--------------------|---------
a1b2c3d4-...                         | org-1   | user@example.com   | event
e5f6g7h8-...                         | org-1   | user@example.com   | event
i9j0k1l2-...                         | org-1   | user@example.com   | event
```

### Тип 2: Один пользователь в разных организациях
**Причина**: Это НЕ дубли - это **нормальное поведение**  
**Пояснение**: Один Telegram пользователь может быть участником нескольких организаций через разные группы.

```sql
SELECT * FROM participants WHERE tg_user_id = 123456789;

-- Результат:
id           | org_id    | tg_user_id  | username
-------------|-----------|-------------|----------
participant1 | org-1     | 123456789   | john_doe
participant2 | org-2     | 123456789   | john_doe
participant3 | org-3     | 123456789   | john_doe
```

**Статус**: ✅ Это корректно, не требует исправления

### Тип 3: Email → Telegram разрыв связи
**Причина**: Пользователь создал participant через email, потом привязал Telegram  
**Пример**:
```
1. Пользователь регистрируется на событие по email → participant #1 (email, tg_user_id=null)
2. Пользователь подтверждает Telegram аккаунт → user_telegram_accounts создается
3. Пользователь отправляет сообщение в группе → participant #2 (tg_user_id, email=null)

Результат: 2 participant для одного человека в одной организации
```

**Статус**: ⚠️ **ТРЕБУЕТ РЕШЕНИЯ**

---

## 🔧 Решения

### Решение 1: Исправить регистрацию на события (ПРИОРИТЕТ 1) ⭐⭐⭐

**Файл**: `app/api/events/[id]/register/route.ts`

**Проблема**: Не ищет participant по email, если нет Telegram аккаунта.

**Решение**: Добавить fallback поиск по email

```typescript
// 1. Сначала пытаемся найти по telegram_user_id
if (telegramAccount?.telegram_user_id) {
  const { data: foundParticipant } = await adminSupabase
    .from('participants')
    .select('id')
    .eq('org_id', event.org_id)
    .eq('tg_user_id', telegramAccount.telegram_user_id)
    .is('merged_into', null)
    .maybeSingle()
  
  participant = foundParticipant
}

// 2. НОВЫЙ FALLBACK: Ищем по email, если не нашли по telegram_user_id
if (!participant && user.email) {
  const { data: foundByEmail } = await adminSupabase
    .from('participants')
    .select('id')
    .eq('org_id', event.org_id)
    .eq('email', user.email)
    .is('merged_into', null)
    .maybeSingle()
  
  participant = foundByEmail
  
  // Если нашли, обновляем tg_user_id (связываем)
  if (participant && telegramAccount?.telegram_user_id) {
    await adminSupabase
      .from('participants')
      .update({ tg_user_id: telegramAccount.telegram_user_id })
      .eq('id', participant.id)
  }
}

// 3. Только если ВООБЩЕ не нашли - создаем нового
if (!participant) {
  // создание...
}
```

**Результат**: Пользователь с email будет иметь одного participant, который потом может быть связан с Telegram.

---

### Решение 2: Исправить Telegram Auth Service (ПРИОРИТЕТ 2) ⭐⭐

**Файл**: `lib/services/telegramAuthService.ts`

**Проблема**: Использует несуществующую колонку `user_id` в participants.

**Решение**: Поиск по `tg_user_id` + `org_id`

```typescript
// БЫЛО:
const existingParticipants = await supabaseFetch(
  `participants?org_id=eq.${targetOrgId}&user_id=eq.${userId}&select=id`
)

// СТАЛО:
const existingParticipants = await supabaseFetch(
  `participants?org_id=eq.${targetOrgId}&tg_user_id=eq.${telegramUserId}&is(merged_into,null)&select=id`
)
```

**Результат**: Telegram-авторизация не будет создавать дубли.

---

### Решение 3: Добавить уникальный индекс (ПРИОРИТЕТ 3) ⭐⭐

**Проблема**: На уровне БД нет защиты от дублей по email в рамках одной организации.

**Решение**: Создать partial unique index

```sql
-- Создаем уникальный индекс для email в рамках организации
-- (только для non-null email и non-merged participants)
CREATE UNIQUE INDEX idx_participants_unique_email_per_org
ON participants (org_id, email)
WHERE email IS NOT NULL AND merged_into IS NULL;
```

**Результат**: БД физически не даст создать 2 participant с одним email в одной org.

---

### Решение 4: Умная логика слияния при привязке Telegram (ПРИОРИТЕТ 2) ⭐⭐

**Проблема**: Когда пользователь с email привязывает Telegram, у него могут быть 2 participant.

**Решение**: При подтверждении Telegram аккаунта проверять и объединять

```typescript
// В lib/services/telegramAuthService.ts или отдельном сервисе
async function linkTelegramToExistingParticipant(
  orgId: string,
  userId: string, 
  telegramUserId: number,
  userEmail: string
) {
  const supabase = createAdminServer()
  
  // 1. Ищем participant по Telegram ID
  const { data: telegramParticipant } = await supabase
    .from('participants')
    .select('id')
    .eq('org_id', orgId)
    .eq('tg_user_id', telegramUserId)
    .is('merged_into', null)
    .maybeSingle()
  
  // 2. Ищем participant по email
  const { data: emailParticipant } = await supabase
    .from('participants')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', userEmail)
    .is('merged_into', null)
    .maybeSingle()
  
  // 3. Если оба существуют и это РАЗНЫЕ - объединяем
  if (telegramParticipant && emailParticipant && 
      telegramParticipant.id !== emailParticipant.id) {
    
    console.log(`Merging participants: ${emailParticipant.id} → ${telegramParticipant.id}`)
    
    // Canonical = participant с Telegram (более полный)
    const canonicalId = telegramParticipant.id
    const duplicateId = emailParticipant.id
    
    // Обновляем email у canonical
    await supabase
      .from('participants')
      .update({ email: userEmail })
      .eq('id', canonicalId)
    
    // Перенаправляем все регистрации
    await supabase
      .from('event_registrations')
      .update({ participant_id: canonicalId })
      .eq('participant_id', duplicateId)
    
    // Помечаем дубль как merged
    await supabase
      .from('participants')
      .update({ merged_into: canonicalId })
      .eq('id', duplicateId)
    
    return canonicalId
  }
  
  // 4. Если есть только email participant - обновляем его tg_user_id
  if (emailParticipant && !telegramParticipant) {
    await supabase
      .from('participants')
      .update({ tg_user_id: telegramUserId })
      .eq('id', emailParticipant.id)
    
    return emailParticipant.id
  }
  
  // 5. Если есть только telegram participant - обновляем его email
  if (telegramParticipant && !emailParticipant) {
    await supabase
      .from('participants')
      .update({ email: userEmail })
      .eq('id', telegramParticipant.id)
    
    return telegramParticipant.id
  }
  
  // 6. Если нет ни того, ни другого - создаем нового
  const { data: newParticipant } = await supabase
    .from('participants')
    .insert({
      org_id: orgId,
      tg_user_id: telegramUserId,
      email: userEmail,
      source: 'telegram',
      status: 'active'
    })
    .select('id')
    .single()
  
  return newParticipant?.id
}
```

**Когда вызывать**: При подтверждении Telegram аккаунта в `app/api/telegram/accounts/verify/route.ts`

---

### Решение 5: Добавить функцию автоматического поиска дублей (ПРИОРИТЕТ 3) ⭐

**Назначение**: Периодическая очистка и объединение дублей.

```sql
-- Функция для поиска потенциальных дублей
CREATE OR REPLACE FUNCTION find_duplicate_participants(p_org_id UUID)
RETURNS TABLE (
  participant_id_1 UUID,
  participant_id_2 UUID,
  match_reason TEXT,
  confidence NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Дубли по email (100% совпадение)
  RETURN QUERY
  SELECT 
    p1.id as participant_id_1,
    p2.id as participant_id_2,
    'email_match' as match_reason,
    1.0 as confidence
  FROM participants p1
  JOIN participants p2 ON p1.email = p2.email 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.email IS NOT NULL
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
  
  -- Дубли по tg_user_id (100% совпадение)
  RETURN QUERY
  SELECT 
    p1.id as participant_id_1,
    p2.id as participant_id_2,
    'telegram_id_match' as match_reason,
    1.0 as confidence
  FROM participants p1
  JOIN participants p2 ON p1.tg_user_id = p2.tg_user_id 
    AND p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.tg_user_id IS NOT NULL
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL;
  
  -- Потенциальные дубли по схожим именам (требует проверки)
  RETURN QUERY
  SELECT 
    p1.id as participant_id_1,
    p2.id as participant_id_2,
    'name_similarity' as match_reason,
    CASE 
      WHEN p1.full_name = p2.full_name THEN 0.8
      WHEN similarity(p1.full_name, p2.full_name) > 0.7 THEN 0.6
      ELSE 0.4
    END as confidence
  FROM participants p1
  JOIN participants p2 ON p1.org_id = p2.org_id
    AND p1.id < p2.id
  WHERE p1.org_id = p_org_id
    AND p1.full_name IS NOT NULL
    AND p2.full_name IS NOT NULL
    AND p1.merged_into IS NULL
    AND p2.merged_into IS NULL
    AND (
      p1.full_name = p2.full_name OR
      similarity(p1.full_name, p2.full_name) > 0.7
    );
END;
$$;
```

**Использование**:
```sql
-- Найти дубли в организации
SELECT * FROM find_duplicate_participants('org-uuid-here')
WHERE confidence >= 0.8;
```

---

## 📋 План внедрения

### Шаг 1: Срочные исправления (сейчас)
1. ✅ Исправить `app/api/events/[id]/register/route.ts` - добавить поиск по email
2. ✅ Исправить `lib/services/telegramAuthService.ts` - поиск по tg_user_id
3. ✅ Создать миграцию с unique index для email

### Шаг 2: Улучшения (в следующий релиз)
4. ⏳ Добавить умное слияние при привязке Telegram
5. ⏳ Создать функцию поиска дублей
6. ⏳ Добавить UI для админов для просмотра и объединения дублей

### Шаг 3: Очистка существующих дублей (после внедрения)
7. ⏳ Запустить скрипт поиска дублей
8. ⏳ Вручную проверить и объединить найденные дубли
9. ⏳ Верифицировать целостность данных

---

## 🧪 Тестовые сценарии

### Сценарий 1: Регистрация на события без Telegram
```
1. Пользователь создает аккаунт по email (без Telegram)
2. Регистрируется на событие 1 → должен создаться participant #1
3. Регистрируется на событие 2 → должен использоваться participant #1 (НЕ создавать новый)
4. Регистрируется на событие 3 → должен использоваться participant #1

Ожидаемый результат: 1 participant для этого пользователя в организации
```

### Сценарий 2: Привязка Telegram после регистрации
```
1. Пользователь регистрируется на событие по email → participant #1 (email, tg_user_id=null)
2. Пользователь подтверждает Telegram аккаунт
3. Система должна:
   - Найти participant #1 по email
   - Обновить tg_user_id у participant #1
   - НЕ создавать participant #2

Ожидаемый результат: 1 participant с заполненными email И tg_user_id
```

### Сценарий 3: Telegram-авторизация для события
```
1. Новый пользователь авторизуется через Telegram для регистрации на событие
2. Должен создаться participant #1 с tg_user_id
3. Повторная авторизация через Telegram
4. Должен использоваться participant #1 (НЕ создавать новый)

Ожидаемый результат: 1 participant
```

---

## 📊 Метрики успеха

После внедрения исправлений:

1. **Количество дублей по email**: должно стать 0
   ```sql
   SELECT email, COUNT(*) 
   FROM participants 
   WHERE email IS NOT NULL AND merged_into IS NULL
   GROUP BY org_id, email 
   HAVING COUNT(*) > 1;
   ```

2. **Количество participant на пользователя в организации**: 1
   ```sql
   SELECT COUNT(DISTINCT p.id) as participant_count
   FROM participants p
   JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id
   WHERE uta.user_id = 'user-uuid' 
     AND p.org_id = 'org-uuid'
     AND p.merged_into IS NULL;
   -- Ожидается: 1
   ```

3. **Рост количества participants**: должен замедлиться
   ```sql
   SELECT DATE(created_at), COUNT(*) 
   FROM participants 
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY DATE(created_at)
   ORDER BY DATE(created_at);
   ```

---

## ⚠️ Риски и митигация

### Риск 1: Потеря данных при объединении
**Митигация**: 
- Всегда использовать `merged_into` вместо удаления
- Сохранять историю объединений
- Возможность отката (restore merged participant)

### Риск 2: Неправильное объединение
**Митигация**:
- Требовать 100% совпадение по email или tg_user_id
- Для имен - только подсказки админу, не автоматическое объединение
- Логирование всех операций слияния

### Риск 3: Race conditions при одновременной регистрации
**Митигация**:
- Использовать транзакции
- Обработка ошибок duplicate key
- Retry logic при конфликтах

---

## 📝 Итого

**Критические проблемы** (требуют немедленного исправления):
1. ❌ Регистрация на события без Telegram создает бесконечные дубли
2. ❌ Telegram-авторизация не находит существующих participants

**Нормальное поведение** (не требует исправления):
- ✅ Один tg_user_id в разных организациях = разные participants

**Архитектурные улучшения** (желательно):
- ⏳ Unique index на email в рамках организации
- ⏳ Автоматическое слияние при привязке Telegram
- ⏳ UI для управления дублями

**Статус**: Готово к внедрению исправлений

