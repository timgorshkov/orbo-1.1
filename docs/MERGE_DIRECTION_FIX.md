# Исправление направления объединения участников

## Критическая проблема

**Симптом**: При объединении дубликатов данные из выбранного дубликата **перезатирали** данные основного (текущего открытого) профиля.

**Пример**:
```
Открыт профиль A: { full_name: "Иван Иванов", email: "ivan@main.com" }
Найден дубликат B: { full_name: "Иван И.", email: "ivan@duplicate.com" }

После объединения:
❌ Профиль A перезатерт данными из B!
❌ full_name = "Иван И." (должно быть "Иван Иванов")
❌ email = "ivan@duplicate.com" (должно быть "ivan@main.com")
```

## Причина

### Неправильная логика (ДО исправления):

1. **Frontend** (`participant-duplicates-card.tsx`):
   ```javascript
   // ❌ НЕПРАВИЛЬНО
   body: JSON.stringify({
     targetId: selectedId // Выбранный дубликат становился target!
   })
   ```

2. **Backend** (`app/api/participants/[participantId]/route.ts`):
   ```javascript
   // ❌ НЕПРАВИЛЬНО
   .rpc('merge_participants_smart', {
     p_target: targetCanonical,      // Выбранный дубликат
     p_duplicates: [canonicalId],    // Текущий открытый профиль
   })
   ```

**Результат**: Текущий профиль объединялся в выбранный дубликат, перезатирая основные данные.

---

## Решение

### Правильная логика (ПОСЛЕ исправления):

#### 1. Frontend изменения

**Файл**: `components/members/participant-duplicates-card.tsx`

**Было**:
```javascript
body: JSON.stringify({
  orgId,
  action: 'mergeDuplicates',
  targetId: selectedId // ❌ Дубликат становился target
})
```

**Стало**:
```javascript
body: JSON.stringify({
  orgId,
  action: 'mergeDuplicates',
  targetId: detail.requestedParticipantId,  // ✅ Текущий профиль = target (canonical)
  duplicateId: selectedId                    // ✅ Дубликат = source (будет merged_into target)
})
```

#### 2. Backend изменения

**Файл**: `app/api/participants/[participantId]/route.ts`

##### 2a. Обновлена функция `handleMergeParticipants`:

```javascript
async function handleMergeParticipants(supabase, actorId, orgId, participantId, payload) {
  const { duplicates, targetId, duplicateId } = payload || {};

  // ✅ Новая логика: participantId = canonical (target), duplicateId = source
  if (duplicateId && typeof duplicateId === 'string') {
    return mergeFromDuplicate(supabase, actorId, orgId, participantId, duplicateId);
  }

  // ⚠️ Старая логика для обратной совместимости
  if (targetId && typeof targetId === 'string') {
    if (targetId === participantId) {
      return NextResponse.json({ error: 'Cannot merge participant into itself' }, { status: 400 });
    }
    return mergeIntoTarget(supabase, actorId, orgId, participantId, targetId);
  }
  
  // ...
}
```

##### 2b. Создана новая функция `mergeFromDuplicate`:

```javascript
/**
 * ✅ НОВАЯ ФУНКЦИЯ: Объединяет дубликат в текущий профиль
 * participantId = canonical (target, основной профиль)
 * duplicateId = source (дубликат, который будет merged_into participantId)
 */
async function mergeFromDuplicate(supabase, actorId, orgId, participantId, duplicateId) {
  // ... проверки ...

  const canonicalId = participantRecord.merged_into || participantRecord.id;
  const duplicateCanonical = duplicateRecord.merged_into || duplicateRecord.id;

  // ✅ ПРАВИЛЬНАЯ ЛОГИКА
  const { data: mergeResult } = await supabase.rpc('merge_participants_smart', {
    p_target: canonicalId,              // ✅ Текущий открытый профиль
    p_duplicates: [duplicateCanonical], // ✅ Выбранный дубликат
    p_actor: actorId
  });

  return NextResponse.json({ 
    merged_into: canonicalId, // ✅ Возвращаем ID текущего профиля
    merge_result: mergeResult
  });
}
```

##### 2c. Старая функция сохранена для совместимости:

```javascript
/**
 * ⚠️ СТАРАЯ ФУНКЦИЯ: Объединяет participantId в targetId (обратная логика)
 * Оставлена для обратной совместимости
 */
async function mergeIntoTarget(supabase, actorId, orgId, participantId, targetId) {
  // ... старая логика ...
}
```

---

## Как работает сейчас

### Сценарий 1: Объединение с правильным направлением

```
1. Пользователь открывает профиль A:
   { full_name: "Иван Иванов", email: "ivan@main.com", phone: null }

2. Находит дубликат B:
   { full_name: "Иван И.", email: "ivan@old.com", phone: "+7123456" }

3. Нажимает "Объединить"

4. Frontend отправляет:
   {
     targetId: A,      // ✅ Основной профиль
     duplicateId: B    // ✅ Дубликат
   }

5. Backend вызывает:
   merge_participants_smart(
     p_target: A,       // ✅ Основной профиль
     p_duplicates: [B]  // ✅ Дубликат
   )

6. SQL функция обрабатывает:
   - full_name: A="Иван Иванов" (не NULL), B="Иван И." (не NULL) → Конфликт
     → trait: full_name_merged = "Иван И."
     → A.full_name остается "Иван Иванов" ✅
   
   - email: A="ivan@main.com" (не NULL), B="ivan@old.com" (не NULL) → Конфликт
     → trait: email_merged = "ivan@old.com"
     → A.email остается "ivan@main.com" ✅
   
   - phone: A=null, B="+7123456" → Заполнение
     → A.phone = "+7123456" ✅

7. Результат:
   Профиль A:
   - full_name: "Иван Иванов" ✅ (НЕ перезатерт!)
   - email: "ivan@main.com" ✅ (НЕ перезатерт!)
   - phone: "+7123456" ✅ (заполнен из B)
   
   Traits:
   - full_name_merged = "Иван И." (из B)
   - email_merged = "ivan@old.com" (из B)
   
   Профиль B:
   - merged_into: A ✅

8. Редирект: /app/[org]/members/A ✅
```

---

## Логика SQL функции (напоминание)

SQL функция `merge_participants_smart` работает правильно:

```sql
-- Для каждого поля:

-- 1. Если target НЕ NULL, а duplicate НЕ NULL и они разные:
IF v_target_value IS NOT NULL 
   AND v_duplicate_value IS NOT NULL 
   AND v_target_value != v_duplicate_value THEN
  -- Сохраняем duplicate в trait
  INSERT INTO participant_traits (trait_key, trait_value, ...)
  -- ✅ target.field НЕ изменяется!
END IF;

-- 2. Если target NULL, а duplicate НЕ NULL:
IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
  -- Заполняем target
  UPDATE participants SET field = v_duplicate_value WHERE id = p_target;
END IF;

-- 3. Если target НЕ NULL, а duplicate NULL:
-- Ничего не делаем, оставляем target как есть ✅
```

**Ключевой момент**: Функция **никогда не перезатирает** заполненное поле в target!

---

## Визуальное сравнение

### ❌ ДО исправления (НЕПРАВИЛЬНО):

```
┌─────────────────────────────────────────────┐
│ Открыт профиль A (основной)                 │
│ ├─ full_name: "Иван Иванов"                 │
│ ├─ email: "ivan@main.com"                   │
│ └─ phone: null                              │
│                                             │
│ Найден дубликат B                           │
│ ├─ full_name: "Иван И."                     │
│ ├─ email: "ivan@duplicate.com"              │
│ └─ phone: "+7123456"                        │
│                                             │
│ Пользователь нажимает "Объединить"          │
│                                             │
│ ❌ Backend: merge A into B                  │
│    (A объединяется в B)                     │
│                                             │
│ Результат в профиле B:                      │
│ ├─ full_name: "Иван И." ❌ (было "Иван Иванов") │
│ ├─ email: "ivan@duplicate.com" ❌ (было "ivan@main.com") │
│ └─ phone: "+7123456"                        │
│                                             │
│ Профиль A: merged_into = B                  │
└─────────────────────────────────────────────┘
```

### ✅ ПОСЛЕ исправления (ПРАВИЛЬНО):

```
┌─────────────────────────────────────────────┐
│ Открыт профиль A (основной)                 │
│ ├─ full_name: "Иван Иванов"                 │
│ ├─ email: "ivan@main.com"                   │
│ └─ phone: null                              │
│                                             │
│ Найден дубликат B                           │
│ ├─ full_name: "Иван И."                     │
│ ├─ email: "ivan@duplicate.com"              │
│ └─ phone: "+7123456"                        │
│                                             │
│ Пользователь нажимает "Объединить"          │
│                                             │
│ ✅ Backend: merge B into A                  │
│    (B объединяется в A)                     │
│                                             │
│ Результат в профиле A:                      │
│ ├─ full_name: "Иван Иванов" ✅ (сохранен!)  │
│ ├─ email: "ivan@main.com" ✅ (сохранен!)    │
│ └─ phone: "+7123456" ✅ (заполнен из B)     │
│                                             │
│ Traits:                                     │
│ ├─ full_name_merged: "Иван И."              │
│ └─ email_merged: "ivan@duplicate.com"       │
│                                             │
│ Профиль B: merged_into = A                  │
└─────────────────────────────────────────────┘
```

---

## Терминология

| Термин | Значение | В коде |
|--------|----------|--------|
| **Target** | Основной профиль (canonical), в который объединяются данные | `p_target`, `canonicalId`, `participantId` |
| **Source / Duplicate** | Дубликат, который объединяется в target | `p_duplicates`, `duplicateId`, `selectedId` |
| **Canonical** | "Главная" запись участника (не merged) | `merged_into IS NULL` |
| **Merged** | Объединенная запись (указывает на canonical) | `merged_into IS NOT NULL` |

---

## Миграция кода

### Для новых запросов:

Используйте новую логику с `duplicateId`:

```javascript
// Frontend
fetch(`/api/participants/${currentParticipantId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    orgId,
    action: 'mergeDuplicates',
    targetId: currentParticipantId,  // ✅ Текущий = target
    duplicateId: selectedDuplicateId // ✅ Дубликат = source
  })
})
```

### Обратная совместимость:

Старая логика (если `targetId !== participantId`) все еще работает:

```javascript
// Старый код (все еще работает)
fetch(`/api/participants/${participantId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    action: 'mergeDuplicates',
    targetId: someOtherId // participantId объединится в someOtherId
  })
})
```

---

## Проверка исправления

### Тест 1: Основные поля не перезатираются

```
1. Создать участника A с full_name="Test Main"
2. Создать участника B с full_name="Test Duplicate"
3. Открыть профиль A
4. Найти B в дубликатах
5. Объединить A + B
6. Проверить:
   ✅ A.full_name = "Test Main" (НЕ "Test Duplicate")
   ✅ Traits содержат full_name_merged = "Test Duplicate"
   ✅ B.merged_into = A
```

### Тест 2: Пустые поля заполняются

```
1. Создать участника A с phone=null
2. Создать участника B с phone="+7123"
3. Открыть профиль A
4. Объединить A + B
5. Проверить:
   ✅ A.phone = "+7123" (заполнено из B)
   ✅ Traits НЕ содержат phone_merged (нет конфликта)
```

### Тест 3: Редирект на правильный профиль

```
1. Открыть профиль A (ID: abc-123)
2. Объединить с дубликатом B
3. Проверить:
   ✅ URL: /app/[org]/members/abc-123 (ID профиля A)
   ✅ НЕ редирект на профиль B
```

---

## Логи для отладки

После исправления в логах Vercel:

```
Merge from duplicate - Current participant (TARGET): {
  id: "abc-123",
  merged_into: null,
  status: "participant",
  canonicalId: "abc-123"
}

Merge from duplicate - Selected duplicate (SOURCE): {
  id: "xyz-789",
  merged_into: null,
  status: "participant",
  duplicateCanonical: "xyz-789"
}

Executing merge_participants_smart: {
  target: "abc-123",        ✅ Текущий профиль
  duplicates: ["xyz-789"],  ✅ Дубликат
  actor: "user-id"
}

Merge result: {
  merged_fields: [
    { field: "phone", action: "filled", value: "+7123456" }
  ],
  conflicts: [
    { field: "full_name", target_value: "Иван Иванов", duplicate_value: "Иван И.", saved_as: "full_name_merged" }
  ]
}
```

---

## Измененные файлы

1. **`components/members/participant-duplicates-card.tsx`**
   - Изменен payload: `targetId` → текущий профиль, добавлен `duplicateId`

2. **`app/api/participants/[participantId]/route.ts`**
   - Обновлена функция `handleMergeParticipants` для поддержки `duplicateId`
   - Добавлена новая функция `mergeFromDuplicate` (правильная логика)
   - Старая функция `mergeIntoTarget` сохранена для совместимости
   - Добавлено детальное логирование

---

## Заключение

После исправления:

✅ **Основной профиль НЕ перезатирается** данными дубликата  
✅ **Конфликты сохраняются в traits**, а не заменяют основные данные  
✅ **Пустые поля заполняются** из дубликата  
✅ **Редирект на правильный профиль** (текущий, не дубликат)  
✅ **Обратная совместимость** со старой логикой сохранена  
✅ **Детальное логирование** для отладки

**Данные больше не теряются при объединении!** 🎉

