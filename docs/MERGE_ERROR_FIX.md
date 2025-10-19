# Исправление ошибки "Participants already share canonical record"

## Проблема

После применения миграции `25_merge_participants_smart.sql` при попытке объединить дубликаты все еще возникала ошибка:

```
PATCH /api/participants/[id] 400 (Bad Request)
Error: Participants already share canonical record
```

## Причина

API поиска дубликатов (`/api/participants/check-duplicates`) **возвращал уже объединенных участников** в списке совпадений.

### Что происходило:

```
1. Участник A объединен с Участником C (A.merged_into = C)
2. Участник B объединен с Участником C (B.merged_into = C)
3. При поиске дубликатов для Участника A:
   - Система находит Участника B (по email/phone/etc.)
   - Возвращает B в списке дубликатов ✅
   - Пользователь пытается объединить A с B
   - API проверяет:
     - canonicalId(A) = C
     - targetCanonical(B) = C
     - C === C ❌ Ошибка!
```

### Схема проблемы:

```
Участник A          Участник B
merged_into: C      merged_into: C
    ↓                   ↓
    └─── Участник C ────┘
         (canonical)

При попытке объединить A + B:
❌ "Participants already share canonical record"
```

## Решение

### 1. Исключение объединенных участников из поиска

**Файл**: `lib/services/participants/matcher.ts`

**Было**:
```typescript
const query = this.supabase
  .from('participants')
  .select('id, org_id, full_name, ...')
  .eq('org_id', intent.orgId);
```

**Стало**:
```typescript
const query = this.supabase
  .from('participants')
  .select('id, org_id, full_name, ..., merged_into')
  .eq('org_id', intent.orgId)
  .is('merged_into', null); // ✅ Исключаем объединенных
```

### 2. Улучшенное логирование

**Файл**: `app/api/participants/[participantId]/route.ts`

Добавлено детальное логирование для отладки:

```typescript
console.log('Merge check - Current participant:', {
  id: participantId,
  merged_into: participantRecord.merged_into,
  status: participantRecord.status,
  canonicalId
});

console.log('Merge check - Target participant:', {
  id: targetId,
  merged_into: targetRecord.merged_into,
  status: targetRecord.status,
  targetCanonical
});
```

### 3. Детальная информация об ошибке

При возникновении ошибки теперь возвращаются подробности:

```json
{
  "error": "Participants already share canonical record",
  "details": {
    "participantId": "uuid-a",
    "targetId": "uuid-b",
    "sharedCanonical": "uuid-c"
  }
}
```

## Workflow после исправления

### Сценарий 1: Нормальное объединение
```
Участник A (активный)
Участник B (активный, дубликат)

Поиск дубликатов для A:
→ Находит B ✅
→ Объединение A + B успешно ✅
→ A.merged_into = B
```

### Сценарий 2: Уже объединенные участники
```
Участник A (merged_into: C)
Участник B (merged_into: C)
Участник C (canonical)

Поиск дубликатов для A:
→ НЕ находит B ✅ (отфильтрован, т.к. B.merged_into != null)
→ Предотвращена попытка объединения ✅
```

### Сценарий 3: Частично объединенные
```
Участник A (активный)
Участник B (merged_into: C)
Участник C (canonical)

Поиск дубликатов для A:
→ НЕ находит B ✅ (отфильтрован)
→ Может найти C ✅
→ Объединение A + C успешно ✅
```

## Изменения в коде

### 1. `lib/services/participants/matcher.ts`

#### Изменение в exact matches:
```typescript
.select('..., merged_into')
.is('merged_into', null) // ← Добавлено
```

#### Изменение в fuzzy matches:
```typescript
.select('..., merged_into')
.is('merged_into', null) // ← Добавлено
```

#### Добавлено логирование:
```typescript
console.log('Finding matches for:', { orgId, email, phone, ... });
console.log('Exact matches found:', exactMatches?.length);
console.log('Fuzzy matches found:', fuzzyMatches?.length);
console.log('Total matches returned:', results.length);
```

#### Обновлен тип:
```typescript
export type MatchCandidate = {
  // ...
  merged_into?: string | null; // ← Добавлено
  // ...
};
```

### 2. `app/api/participants/[participantId]/route.ts`

#### Добавлено детальное логирование:
```typescript
console.log('Merge check - Current participant:', { ... });
console.log('Merge check - Target participant:', { ... });
console.error('Participants already share canonical record:', { ... });
```

#### Улучшено сообщение об ошибке:
```typescript
return NextResponse.json({ 
  error: 'Participants already share canonical record',
  details: {
    participantId,
    targetId,
    sharedCanonical: canonicalId
  }
}, { status: 400 });
```

## Проверка исправления

### Тест 1: Поиск дубликатов не возвращает объединенных
```sql
-- Создать тестовых участников
INSERT INTO participants (org_id, full_name, email, merged_into)
VALUES 
  ('org-id', 'Иван Петров', 'ivan@test.com', NULL),
  ('org-id', 'Петров И.', 'ivan@test.com', 'canonical-uuid');

-- Запросить дубликаты для первого участника
-- Ожидание: второй участник НЕ должен быть найден
```

### Тест 2: Проверка логов
```
1. Открыть консоль браузера
2. Перейти на вкладку "Дубликаты"
3. Нажать "Обновить список"
4. Проверить логи:
   - Finding matches for: { orgId, email, ... }
   - Exact matches found: N
   - Fuzzy matches found: M
   - Total matches returned: K
```

### Тест 3: Успешное объединение
```
1. Открыть профиль активного участника (без merged_into)
2. Перейти на вкладку "Дубликаты"
3. Убедиться, что в списке только активные участники
4. Выбрать дубликата
5. Нажать "Объединить"
6. Ожидание: успешное объединение без ошибок
```

## Мониторинг

### Проверка объединенных участников

```sql
-- Количество объединенных участников
SELECT COUNT(*) as merged_count
FROM participants
WHERE merged_into IS NOT NULL;
```

### Проверка цепочек объединения

```sql
-- Участники, объединенные в других участников
SELECT 
  p1.id as participant_id,
  p1.full_name as participant_name,
  p1.merged_into,
  p2.full_name as canonical_name,
  p2.merged_into as canonical_merged_into
FROM participants p1
LEFT JOIN participants p2 ON p2.id = p1.merged_into
WHERE p1.merged_into IS NOT NULL
ORDER BY p1.created_at DESC
LIMIT 20;
```

### Поиск потенциальных проблем

```sql
-- Участники с циклическими ссылками (не должно быть!)
WITH RECURSIVE chain AS (
  SELECT id, merged_into, 1 as depth
  FROM participants
  WHERE merged_into IS NOT NULL
  
  UNION ALL
  
  SELECT c.id, p.merged_into, c.depth + 1
  FROM chain c
  JOIN participants p ON p.id = c.merged_into
  WHERE c.depth < 10
)
SELECT id, merged_into, depth
FROM chain
WHERE depth > 1
ORDER BY depth DESC;
```

## Лучшие практики

### 1. Регулярная очистка
Периодически проверяйте и исправляйте участников с некорректными ссылками:

```sql
-- Участники, ссылающиеся на несуществующих
SELECT p1.id, p1.full_name, p1.merged_into
FROM participants p1
LEFT JOIN participants p2 ON p2.id = p1.merged_into
WHERE p1.merged_into IS NOT NULL
  AND p2.id IS NULL;
```

### 2. Проверка перед объединением
В UI можно добавить предупреждение, если участник уже был объединен:

```typescript
if (participant.merged_into) {
  alert('Этот участник уже был объединен с другим профилем');
  return;
}
```

### 3. История объединений
Сохраняйте аудит объединений для отслеживания:

```sql
SELECT 
  action,
  participant_id,
  field_changes,
  created_at
FROM participant_audit_log
WHERE action = 'merge'
ORDER BY created_at DESC
LIMIT 50;
```

## Заключение

Теперь система корректно:
- ✅ Исключает объединенных участников из поиска дубликатов
- ✅ Предотвращает попытки объединить уже связанных участников
- ✅ Предоставляет детальную информацию для отладки
- ✅ Логирует все этапы процесса объединения

Ошибка "Participants already share canonical record" больше не должна возникать при нормальном использовании! 🎉

