# Умное объединение участников без потери данных

## Проблема

При объединении дубликатов участников **все данные из объединяемого профиля терялись**. Старая функция `merge_participants_extended` только:
- Переносила связи групп
- Переносила характеристики
- Переносила события активности
- **НО НЕ объединяла поля** (email, phone, full_name, etc.)

**Результат**: Если у дубликата был заполнен телефон, а у основного профиля - нет, этот телефон **терялся навсегда**.

## Решение

Реализовано **умное объединение** с сохранением всех данных по следующей логике:

### Логика обработки полей

Для каждого поля (email, phone, full_name, username, first_name, last_name):

```
IF target.field = NULL AND duplicate.field ≠ NULL
   → Копировать: target.field = duplicate.field
   ✅ Результат: Пустое поле заполнено

ELSE IF target.field ≠ NULL AND duplicate.field ≠ NULL AND target.field ≠ duplicate.field
   → Сохранить конфликт в характеристики:
      - trait_key = "phone_merged" (или "phone_merged_2" если уже есть)
      - trait_value = duplicate.field
      - metadata = { merged_from, original_field, conflict_with }
   ✅ Результат: Оба значения сохранены, можно выбрать правильное

ELSE IF target.field = duplicate.field
   → Ничего не делать
   ✅ Результат: Дублирование не создаётся
```

### Почему этот подход оптимален

| Критерий | Оценка | Пояснение |
|----------|---------|-----------|
| **Потеря данных** | ✅ Нулевая | Все данные сохраняются |
| **Прозрачность** | ✅ Высокая | Видно, откуда пришли данные |
| **Гибкость** | ✅ Максимальная | Можно вручную выбрать правильное значение |
| **История** | ✅ Полная | Metadata содержит контекст |
| **Простота использования** | ✅ Автоматическая | Не требует участия пользователя |
| **Масштабируемость** | ✅ Хорошая | Характеристики нумеруются автоматически |

### Сравнение с альтернативами

#### Вариант A: Просто заполнять пустые
```sql
IF target.field IS NULL THEN
  target.field = duplicate.field
END IF
```
❌ **Недостаток**: Конфликтующие значения теряются

#### Вариант B: Умное объединение (выбран)
```sql
IF target.field IS NULL THEN
  target.field = duplicate.field
ELSIF target.field != duplicate.field THEN
  -- Сохранить в характеристики
END IF
```
✅ **Преимущество**: Никакие данные не теряются

#### Вариант C: Интерактивный выбор
```sql
-- При конфликте запросить у пользователя выбор
```
❌ **Недостаток**: Требует участия пользователя, замедляет процесс

## Реализация

### 1. Новая SQL функция `merge_participants_smart`

**Файл**: `db/migrations/25_merge_participants_smart.sql`

**Ключевые особенности**:
- Обрабатывает 6 основных полей: full_name, email, phone, username, first_name, last_name
- Автоматически нумерует конфликтующие характеристики (phone_merged, phone_merged_2, etc.)
- Сохраняет метаданные о конфликте (откуда пришло, с чем конфликтовало)
- Возвращает подробный JSON с результатами объединения

**Возвращаемое значение**:
```json
{
  "merged_fields": [
    {
      "field": "phone",
      "action": "filled",
      "value": "+79991234567"
    }
  ],
  "conflicts": [
    {
      "field": "email",
      "target_value": "ivan@example.com",
      "duplicate_value": "ivan.petrov@example.com",
      "saved_as": "email_merged"
    }
  ],
  "target": "uuid-target",
  "duplicates": ["uuid-duplicate"]
}
```

### 2. Обновлённый API endpoint

**Файл**: `app/api/participants/[participantId]/route.ts`

**Изменения**:
```typescript
// Пытаемся использовать новую функцию
const { data: mergeResult, error: mergeError } = await supabase
  .rpc('merge_participants_smart', {
    p_target: targetCanonical,
    p_duplicates: [canonicalId],
    p_actor: actorId
  });

// Если не найдена, используем старую (обратная совместимость)
if (mergeError) {
  await supabase.rpc('merge_participants_extended', ...);
}

// Возвращаем результаты клиенту
return NextResponse.json({ 
  success: true, 
  detail, 
  merged_into: targetCanonical,
  merge_result: mergeResult // ← Новое
});
```

### 3. Улучшённый UI компонент

**Файл**: `components/members/participant-duplicates-card.tsx`

**Новая функциональность**:
```typescript
// После успешного объединения показываем детали
if (data?.merge_result) {
  const result = data.merge_result;
  let message = 'Профили успешно объединены!\n\n';
  
  if (result.merged_fields.length > 0) {
    message += `Заполнено полей: ${result.merged_fields.length}\n`;
  }
  
  if (result.conflicts.length > 0) {
    message += `\nКонфликтующих значений: ${result.conflicts.length}\n`;
    message += 'Они сохранены в характеристиках\n';
  }
  
  alert(message);
}
```

## Примеры использования

### Пример 1: Простое заполнение пустых полей

**До объединения**:
```
Target:
  - full_name: "Иван Петров"
  - email: null
  - phone: null

Duplicate:
  - full_name: "Иван"
  - email: "ivan@example.com"
  - phone: "+79991234567"
```

**После объединения**:
```
Target:
  - full_name: "Иван Петров" (не изменилось)
  - email: "ivan@example.com" ✅ Заполнено
  - phone: "+79991234567" ✅ Заполнено

Characteristics: (пусто)
```

**Результат**:
```json
{
  "merged_fields": [
    {"field": "email", "value": "ivan@example.com"},
    {"field": "phone", "value": "+79991234567"}
  ],
  "conflicts": []
}
```

### Пример 2: Конфликтующие значения

**До объединения**:
```
Target:
  - full_name: "Иван Петров"
  - email: "ivan@example.com"
  - phone: "+79991234567"

Duplicate:
  - full_name: "Петров Иван"
  - email: "ivan.petrov@gmail.com"
  - phone: "+79991234567" (одинаковый)
```

**После объединения**:
```
Target:
  - full_name: "Иван Петров" (не изменилось)
  - email: "ivan@example.com" (не изменилось)
  - phone: "+79991234567" (не изменилось)

Characteristics:
  - full_name_merged: "Петров Иван" ✅
    metadata: {
      merged_from: "uuid-duplicate",
      original_field: "full_name",
      conflict_with: "Иван Петров"
    }
  - email_merged: "ivan.petrov@gmail.com" ✅
    metadata: {
      merged_from: "uuid-duplicate",
      original_field: "email",
      conflict_with: "ivan@example.com"
    }
```

**Результат**:
```json
{
  "merged_fields": [],
  "conflicts": [
    {
      "field": "full_name",
      "target_value": "Иван Петров",
      "duplicate_value": "Петров Иван",
      "saved_as": "full_name_merged"
    },
    {
      "field": "email",
      "target_value": "ivan@example.com",
      "duplicate_value": "ivan.petrov@gmail.com",
      "saved_as": "email_merged"
    }
  ]
}
```

### Пример 3: Множественные конфликты одного поля

**До объединения**:
```
Target:
  - phone: "+79991111111"
  - Characteristics:
    - phone_merged: "+79992222222" (от предыдущего объединения)

Duplicate:
  - phone: "+79993333333"
```

**После объединения**:
```
Target:
  - phone: "+79991111111" (не изменилось)
  - Characteristics:
    - phone_merged: "+79992222222" (старое)
    - phone_merged_2: "+79993333333" ✅ Новое
```

**Результат**:
```json
{
  "merged_fields": [],
  "conflicts": [
    {
      "field": "phone",
      "target_value": "+79991111111",
      "duplicate_value": "+79993333333",
      "saved_as": "phone_merged_2"
    }
  ]
}
```

## Миграция

### Применение миграции

```bash
# Применить новую миграцию
supabase db push

# Или через Supabase Dashboard:
# SQL Editor → Вставить содержимое 25_merge_participants_smart.sql → Run
```

### Обратная совместимость

Код автоматически определяет, доступна ли новая функция:
```typescript
// Пытаемся использовать новую
const { data, error } = await supabase.rpc('merge_participants_smart', ...);

if (error) {
  // Fallback на старую функцию
  await supabase.rpc('merge_participants_extended', ...);
}
```

Это позволяет:
- ✅ Применять миграцию постепенно
- ✅ Не ломать существующий код
- ✅ Тестировать в staging перед production

## Работа с конфликтами

### Просмотр конфликтов

Все конфликтующие значения сохраняются как характеристики с префиксом `*_merged`:

```sql
SELECT 
  trait_key,
  trait_value,
  metadata->>'original_field' as original_field,
  metadata->>'conflict_with' as conflict_with
FROM participant_traits
WHERE participant_id = 'target-uuid'
  AND source = 'merge'
ORDER BY created_at DESC;
```

### Разрешение конфликтов вручную

Администратор может:

1. **Выбрать правильное значение**:
```typescript
// Обновить основное поле правильным значением
await supabase
  .from('participants')
  .update({ phone: '+79993333333' })
  .eq('id', participantId);

// Удалить характеристику
await supabase
  .from('participant_traits')
  .delete()
  .eq('trait_key', 'phone_merged');
```

2. **Оставить обе записи** для истории

3. **Добавить примечание**:
```typescript
await supabase
  .from('participant_traits')
  .update({ 
    metadata: { 
      ...existing_metadata, 
      note: 'Старый номер, больше не используется' 
    }
  })
  .eq('trait_key', 'phone_merged');
```

## Мониторинг

### Статистика объединений

```sql
-- Количество конфликтов по полям
SELECT 
  metadata->>'original_field' as field,
  COUNT(*) as conflicts_count
FROM participant_traits
WHERE source = 'merge'
GROUP BY metadata->>'original_field'
ORDER BY conflicts_count DESC;
```

### Участники с конфликтами

```sql
-- Участники, у которых есть конфликтующие значения
SELECT 
  p.id,
  p.full_name,
  COUNT(pt.id) as conflicts_count,
  array_agg(pt.trait_key) as conflict_keys
FROM participants p
JOIN participant_traits pt ON pt.participant_id = p.id
WHERE pt.source = 'merge'
GROUP BY p.id, p.full_name
ORDER BY conflicts_count DESC;
```

## Лучшие практики

### 1. Проверка перед объединением
Просматривайте список дубликатов и проверяйте, какой профиль более полный.

### 2. Разрешение конфликтов
После объединения проверяйте характеристики с префиксом `*_merged` и разрешайте конфликты.

### 3. Очистка
Периодически удаляйте разрешённые конфликты:
```sql
DELETE FROM participant_traits
WHERE source = 'merge'
  AND metadata->>'resolved' = 'true';
```

### 4. Документирование
Добавляйте примечания к конфликтам для других администраторов.

## Тестирование

### Тест 1: Заполнение пустых полей
```
✅ Создать двух участников с непересекающимися полями
✅ Объединить их
✅ Проверить, что все поля заполнены
✅ Проверить, что конфликтов нет
```

### Тест 2: Обработка конфликтов
```
✅ Создать двух участников с одинаковыми полями, но разными значениями
✅ Объединить их
✅ Проверить, что значение target не изменилось
✅ Проверить, что конфликты сохранены в характеристики
✅ Проверить metadata конфликтов
```

### Тест 3: Множественные конфликты
```
✅ Создать участника с характеристикой phone_merged
✅ Объединить с другим участником с конфликтующим phone
✅ Проверить, что новая характеристика названа phone_merged_2
```

### Тест 4: Обратная совместимость
```
✅ НЕ применять миграцию
✅ Попытаться объединить участников
✅ Проверить, что используется старая функция (fallback)
✅ Проверить, что ошибок нет
```

## Заключение

Новая система объединения участников:
- ✅ **Не теряет данные** - все значения сохраняются
- ✅ **Прозрачна** - видно, что было объединено
- ✅ **Гибкая** - можно вручную разрешить конфликты
- ✅ **Обратно совместима** - работает со старой функцией
- ✅ **Автоматическая** - не требует участия пользователя

Конфликтующие значения сохраняются в характеристики, где их можно:
- Просмотреть
- Сравнить с текущим значением
- Выбрать правильное
- Или оставить для истории

Это оптимальное решение для безопасного объединения дубликатов! 🎉

