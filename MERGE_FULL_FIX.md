# Полное исправление проблем с объединением участников

## Проблемы

### 1. Список участников не уменьшается после объединения
**Симптом**: После объединения дубликатов в списке участников все еще отображаются объединенные профили.

**Причина**: Запрос в `app/app/[org]/members/page.tsx` не фильтровал участников с `merged_into != null`.

### 2. Поля не заполняются после объединения
**Симптом**: Всплывающее окно сообщает, что поля заполнены, но в профиле они пустые.

**Причина**: SQL функция `merge_participants_smart` загружала `v_target_record` один раз в начале и не перезагружала его после обновления каждого дубликата. При обработке нескольких дубликатов использовались устаревшие данные.

### 3. Характеристики не отображаются
**Симптом**: Всплывающее окно говорит, что конфликты сохранены в характеристики, но в профиле их нет.

**Причина**: Компонент `participant-profile-card.tsx` отображал только `custom_attributes` (JSON поле), но не показывал `traits` из таблицы `participant_traits`, куда функция merge сохраняет конфликты.

## Решения

### Исправление 1: Фильтр объединенных участников в списке

**Файл**: `app/app/[org]/members/page.tsx`

**Было**:
```typescript
const { data: participants, error } = await adminSupabase
  .from('participants')
  .select('*')
  .eq('org_id', orgId)
  .neq('participant_status', 'excluded')
  .order('full_name', { ascending: true, nullsFirst: false })
```

**Стало**:
```typescript
const { data: participants, error} = await adminSupabase
  .from('participants')
  .select('*')
  .eq('org_id', orgId)
  .neq('participant_status', 'excluded')
  .is('merged_into', null) // ✅ Исключаем объединенных участников
  .order('full_name', { ascending: true, nullsFirst: false })
```

**Результат**: Объединенные участники больше не отображаются в списке.

---

### Исправление 2: Перезагрузка target record в SQL функции

**Файл**: `db/migrations/26_fix_merge_smart_reload.sql`

**Проблема в старой версии**:
```sql
-- Загружалось ДО цикла
SELECT * INTO v_target_record
FROM public.participants
WHERE id = p_target;

FOREACH v_duplicate IN ARRAY p_duplicates
LOOP
  -- Используется v_target_record (устаревшие данные!)
  v_target_value := v_target_record.full_name;
  
  -- Обновляется БД
  UPDATE public.participants
  SET full_name = v_duplicate_value
  WHERE id = p_target;
  
  -- Но v_target_record не обновляется!
END LOOP;
```

**Новая версия**:
```sql
FOREACH v_duplicate IN ARRAY p_duplicates
LOOP
  -- ✅ Перезагружаем target перед обработкой каждого дубликата
  SELECT * INTO v_target_record
  FROM public.participants
  WHERE id = p_target;
  
  -- Теперь используются актуальные данные
  v_target_value := v_target_record.full_name;
  
  IF v_target_value IS NULL AND v_duplicate_value IS NOT NULL THEN
    UPDATE public.participants
    SET full_name = v_duplicate_value
    WHERE id = p_target;
  END IF;
END LOOP;
```

**Результат**: При обработке нескольких дубликатов каждый последующий видит обновленные данные предыдущего.

---

### Исправление 3: Отображение traits в профиле

**Файл**: `components/members/participant-profile-card.tsx`

**Добавлено**:
```tsx
{/* Traits from database (including merged conflicts) */}
{detail.traits && detail.traits.length > 0 && (
  <div className="space-y-2 mb-4">
    <h4 className="text-sm font-medium text-gray-600 mb-2">
      Характеристики из базы данных
    </h4>
    {detail.traits.map((trait) => (
      <div 
        key={trait.id} 
        className={`flex items-start gap-3 p-3 rounded-lg ${
          trait.source === 'merge' 
            ? 'bg-amber-50 border border-amber-200' 
            : 'bg-gray-50'
        }`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {trait.trait_key}
            </div>
            {trait.source === 'merge' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Из объединения
              </span>
            )}
          </div>
          <div className="text-sm text-gray-900 mt-1">{trait.trait_value}</div>
          {trait.metadata && trait.source === 'merge' && (
            <div className="text-xs text-gray-500 mt-1">
              {trait.metadata.conflict_with && (
                <span>Конфликт с: {trait.metadata.conflict_with}</span>
              )}
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
)}
```

**Результат**: 
- Traits из `participant_traits` теперь отображаются в профиле
- Конфликты из объединения выделены янтарным фоном и меткой "Из объединения"
- Показывается, с каким значением был конфликт

---

### Исправление 4: Исключение объединенных из поиска дубликатов

**Файлы**: 
- `lib/services/participants/matcher.ts`
- `app/api/participants/[participantId]/route.ts`

**Изменения в matcher.ts**:
```typescript
const query = this.supabase
  .from('participants')
  .select('id, org_id, ..., merged_into')
  .eq('org_id', intent.orgId)
  .is('merged_into', null) // ✅ Исключаем уже объединенных
```

**Добавлено детальное логирование в route.ts**:
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

**Результат**: Предотвращена ошибка "Participants already share canonical record".

---

## Полный workflow после исправлений

### Сценарий 1: Объединение двух участников

```
Начальное состояние:
- Участник A: { full_name: "Иван Иванов", email: "ivan@old.com", phone: null }
- Участник B: { full_name: "Иван И.", email: "ivan@new.com", phone: "+7123456" }

Объединение A + B:

1. API вызывает merge_participants_smart(target=B, duplicates=[A])
2. Функция обрабатывает A:
   - full_name: B="Иван Иванов" ≠ A="Иван И." → Конфликт
     → Сохраняет "Иван И." в trait "full_name_merged"
   - email: B="ivan@new.com" ≠ A="ivan@old.com" → Конфликт
     → Сохраняет "ivan@old.com" в trait "email_merged"
   - phone: B=null, A="+7123456" → Заполнение
     → UPDATE participants SET phone="+7123456" WHERE id=B
3. Вызывается merge_participants_extended для переноса связей
4. A.merged_into = B
5. Возвращается JSON:
   {
     merged_fields: [{ field: "phone", action: "filled", value: "+7123456" }],
     conflicts: [
       { field: "full_name", target_value: "Иван Иванов", duplicate_value: "Иван И.", saved_as: "full_name_merged" },
       { field: "email", target_value: "ivan@new.com", duplicate_value: "ivan@old.com", saved_as: "email_merged" }
     ],
     target: B,
     merged_into: B
   }

Финальное состояние:
- Участник A: { merged_into: B } (не отображается в списке)
- Участник B: { 
    full_name: "Иван Иванов", 
    email: "ivan@new.com", 
    phone: "+7123456" 
  }
- Traits для B:
  - { trait_key: "full_name_merged", trait_value: "Иван И.", source: "merge" }
  - { trait_key: "email_merged", trait_value: "ivan@old.com", source: "merge" }

UI:
- Список участников: только B отображается ✅
- Профиль B: phone заполнен ✅
- Характеристики B: показаны 2 конфликта с меткой "Из объединения" ✅
- Редирект: /app/[org]/members/B ✅
```

### Сценарий 2: Объединение нескольких дубликатов подряд

```
Начальное состояние:
- Участник A: { full_name: "Иван", email: "a@test.com", phone: null }
- Участник B: { full_name: null, email: "b@test.com", phone: "+7111" }
- Участник C: { full_name: "Иван Иванов", email: null, phone: "+7222" }

Объединение A + B + C (target=A, duplicates=[B, C]):

Итерация 1 (B):
1. Загружается A (fresh): { full_name: "Иван", email: "a@test.com", phone: null }
2. full_name: A="Иван", B=null → Нет действий
3. email: A="a@test.com", B="b@test.com" → Конфликт
   → trait: email_merged = "b@test.com"
4. phone: A=null, B="+7111" → Заполнение
   → UPDATE: A.phone = "+7111"
5. B.merged_into = A

Итерация 2 (C):
1. ✅ Перезагружается A (fresh): { full_name: "Иван", email: "a@test.com", phone: "+7111" }
2. full_name: A="Иван", C="Иван Иванов" → Конфликт
   → trait: full_name_merged = "Иван Иванов"
3. email: A="a@test.com", C=null → Нет действий
4. phone: A="+7111", C="+7222" → Конфликт
   → trait: phone_merged = "+7222"
5. C.merged_into = A

Финальное состояние A:
- full_name: "Иван"
- email: "a@test.com"
- phone: "+7111" (из B)
- Traits:
  - email_merged = "b@test.com" (из B)
  - full_name_merged = "Иван Иванов" (из C)
  - phone_merged = "+7222" (из C)

✅ Все данные сохранены, ничего не потеряно!
```

---

## Проверка исправлений

### 1. Применить миграцию

```bash
# В Supabase SQL Editor
-- Выполните содержимое файла:
db/migrations/26_fix_merge_smart_reload.sql
```

### 2. Проверить фильтр в списке

```sql
-- До исправления: показывало объединенных
SELECT id, full_name, merged_into
FROM participants
WHERE org_id = 'your-org-id'
AND participant_status != 'excluded';

-- После исправления: только активные
SELECT id, full_name, merged_into
FROM participants
WHERE org_id = 'your-org-id'
AND participant_status != 'excluded'
AND merged_into IS NULL;
```

### 3. Тест объединения с несколькими дубликатами

```sql
-- Создать тестовых участников
INSERT INTO participants (org_id, full_name, email, phone)
VALUES 
  ('org-id', 'Иван Петров', 'ivan@test.com', NULL),
  ('org-id', NULL, 'ivan2@test.com', '+7111'),
  ('org-id', 'И. Петров', NULL, '+7222');

-- Получить их ID
SELECT id, full_name, email, phone FROM participants WHERE org_id = 'org-id' AND full_name LIKE '%етров%' OR email LIKE 'ivan%';

-- Объединить через UI
-- Проверить результат:
SELECT 
  p.id, 
  p.full_name, 
  p.email, 
  p.phone,
  p.merged_into,
  COUNT(t.id) as traits_count
FROM participants p
LEFT JOIN participant_traits t ON t.participant_id = p.id
WHERE p.org_id = 'org-id'
GROUP BY p.id, p.full_name, p.email, p.phone, p.merged_into;

-- Проверить traits
SELECT 
  trait_key, 
  trait_value, 
  source, 
  metadata
FROM participant_traits
WHERE participant_id = 'target-participant-id'
ORDER BY created_at DESC;
```

### 4. Проверить UI

1. **Список участников**:
   - Открыть `/app/[org]/members`
   - Убедиться что объединенные участники не отображаются
   - Количество должно соответствовать числу строк с `merged_into IS NULL`

2. **Профиль участника**:
   - Открыть профиль участника, который был целью объединения
   - В разделе "Дополнительная информация" должны быть видны:
     - Характеристики из базы данных (если есть traits)
     - Конфликты из объединения с янтарным фоном
     - Метка "Из объединения"

3. **Объединение дубликатов**:
   - Открыть вкладку "Дубликаты"
   - Нажать "Обновить список"
   - Убедиться что текущий участник не появляется в списке
   - Объединить с дубликатом
   - Проверить всплывающее окно:
     - "Заполнены поля: ..."
     - "Конфликты сохранены как характеристики: ..."
   - После редиректа проверить что:
     - Поля действительно заполнены
     - Характеристики отображаются в профиле

---

## Измененные файлы

1. **`app/app/[org]/members/page.tsx`**
   - Добавлен фильтр `.is('merged_into', null)`

2. **`db/migrations/26_fix_merge_smart_reload.sql`**
   - Исправлена функция `merge_participants_smart`
   - Добавлена перезагрузка `v_target_record` в цикле

3. **`components/members/participant-profile-card.tsx`**
   - Добавлено отображение `detail.traits`
   - Специальное форматирование для traits с `source='merge'`

4. **`lib/services/participants/matcher.ts`**
   - Добавлен фильтр `.is('merged_into', null)` в exact и fuzzy поиске
   - Добавлено поле `merged_into` в тип `MatchCandidate`
   - Добавлено логирование поиска

5. **`app/api/participants/[participantId]/route.ts`**
   - Добавлено детальное логирование процесса merge
   - Улучшено сообщение об ошибке с деталями

---

## Архитектурные принципы

### 1. Каноническая запись (Canonical Record)

- Один участник (target) становится "каноническим"
- Все дубликаты получают `merged_into = canonical_id`
- Все данные хранятся в canonical record
- Все связи (группы, события, активность) переносятся на canonical record

### 2. Сохранение данных

**Заполнение пустых полей**:
```
IF target.field IS NULL AND duplicate.field IS NOT NULL THEN
  target.field = duplicate.field
```

**Конфликты**:
```
IF target.field != duplicate.field (оба не NULL) THEN
  CREATE participant_trait (
    trait_key = 'field_merged',
    trait_value = duplicate.field,
    source = 'merge',
    metadata = { 
      conflict_with: target.field,
      merged_from: duplicate.id 
    }
  )
```

### 3. Отображение в UI

**Списки**:
- Показывать только записи с `merged_into IS NULL`
- Фильтр применять на уровне SQL запроса

**Профиль**:
- Если открыт merged участник (A.merged_into = B), показывать canonical (B)
- Traits отображать вместе с основными полями
- Traits с `source='merge'` выделять визуально

**Дубликаты**:
- Исключать из поиска записи с `merged_into IS NOT NULL`
- Исключать текущего участника из результатов

---

## Диагностика проблем

### Проблема: "Поле не заполнилось"

```sql
-- Проверить историю изменений
SELECT * FROM participant_audit_log
WHERE participant_id = 'target-id'
AND action = 'merge'
ORDER BY created_at DESC
LIMIT 5;

-- Проверить что функция вызывалась
SELECT * FROM pg_stat_statements
WHERE query LIKE '%merge_participants_smart%'
ORDER BY last_exec DESC
LIMIT 5;
```

### Проблема: "Характеристика не отображается"

```sql
-- Проверить что trait существует
SELECT * FROM participant_traits
WHERE participant_id = 'target-id'
AND source = 'merge'
ORDER BY created_at DESC;

-- Проверить что detail.traits загружается
-- В lib/server/getParticipantDetail.ts:65-69
```

### Проблема: "Дубликат все еще в списке"

```sql
-- Проверить merged_into
SELECT id, full_name, merged_into, participant_status
FROM participants
WHERE id = 'duplicate-id';

-- Если merged_into NULL, значит merge не выполнился
-- Проверить логи API
```

---

## Лучшие практики

### 1. Всегда перезагружать данные после UPDATE

```sql
-- ❌ Неправильно
SELECT * INTO v_record FROM table WHERE id = 1;
UPDATE table SET field = 'new' WHERE id = 1;
-- v_record.field все еще старое!

-- ✅ Правильно
LOOP
  SELECT * INTO v_record FROM table WHERE id = 1;
  UPDATE table SET field = 'new' WHERE id = 1;
END LOOP;
```

### 2. Фильтровать merged записи на уровне SQL

```typescript
// ✅ Правильно - фильтр в SQL
.from('participants')
.is('merged_into', null)

// ❌ Неправильно - фильтр в JS
const filtered = participants.filter(p => !p.merged_into)
```

### 3. Всегда показывать canonical record

```typescript
const canonicalId = participant.merged_into || participant.id;
const detail = await getParticipantDetail(orgId, canonicalId);
```

---

## Заключение

После применения всех исправлений система корректно:

✅ **Скрывает объединенных участников** из списка  
✅ **Заполняет пустые поля** при объединении нескольких дубликатов  
✅ **Отображает характеристики** (traits) в профиле  
✅ **Сохраняет конфликты** как traits с метаданными  
✅ **Редиректит на правильного участника** (canonical)  
✅ **Предотвращает повторное объединение** одних и тех же участников  
✅ **Логирует процесс** для отладки

Данные больше не теряются при объединении! 🎉

