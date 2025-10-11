# Исправление: Характеристики не сохраняются

## Проблема

Характеристики (`custom_attributes`) добавляются в профиль участника и отображаются сразу после сохранения, но после перезагрузки страницы исчезают.

### Почему это происходило:

1. ✅ Frontend корректно отправляет данные на API
2. ✅ API правильно принимает `custom_attributes` в `allowedFields`
3. ✅ API пытается сохранить в БД
4. ❌ **В базе данных отсутствует поле `custom_attributes`!**

### Симптомы:

- Характеристика появляется сразу после сохранения (обновился frontend state)
- После ухода со страницы и возврата - исчезает (в БД не сохранилось)
- Нет ошибок в консоли браузера (API возвращает 200 OK)
- Supabase молча игнорирует поле, которого нет в схеме

## Корневая причина

В исходной схеме базы данных (`01_initial_schema.sql`) таблица `participants` создана без поля `custom_attributes`:

```sql
-- Было (01_initial_schema.sql):
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  tg_user_id bigint,
  username text,
  full_name text,
  phone text,
  email text,
  interests text[],
  created_at timestamptz default now()
  -- ❌ Нет custom_attributes!
);
```

## Решение

### Миграция 27: Добавление custom_attributes

**Файл**: `db/migrations/27_add_custom_attributes.sql`

```sql
-- Добавляем поле custom_attributes для хранения произвольных характеристик участника
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb;

-- Создаем индекс для быстрого поиска по custom_attributes
CREATE INDEX IF NOT EXISTS idx_participants_custom_attributes 
ON public.participants USING gin (custom_attributes);

-- Комментарий для документации
COMMENT ON COLUMN public.participants.custom_attributes IS 
'JSON поле для хранения произвольных характеристик участника (должность, город, интересы и т.д.)';
```

### Почему JSONB?

- **JSONB**: Бинарный формат JSON с индексацией
- Позволяет хранить структурированные данные без заранее определенной схемы
- Поддерживает GIN индексы для быстрого поиска
- Идеально для key-value характеристик: `{ "Должность": "Менеджер", "Город": "Москва" }`

## Применение миграции

### Шаг 1: Применить SQL в Supabase

1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое `db/migrations/27_add_custom_attributes.sql`
3. Выполните SQL
4. Проверьте успешное выполнение

### Шаг 2: Проверка

Выполните в SQL Editor:

```sql
-- Проверить, что поле добавлено
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'participants' 
  AND column_name = 'custom_attributes';

-- Ожидаемый результат:
-- column_name       | data_type | column_default
-- custom_attributes | jsonb     | '{}'::jsonb
```

### Шаг 3: Проверить индекс

```sql
-- Проверить, что индекс создан
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'participants' 
  AND indexname = 'idx_participants_custom_attributes';

-- Ожидаемый результат:
-- indexname                              | indexdef
-- idx_participants_custom_attributes     | CREATE INDEX ...
```

## Дополнительное логирование (уже добавлено)

В API уже добавлено детальное логирование для отладки:

**Файл**: `app/api/participants/[participantId]/route.ts`

```typescript
// Логирование перед сохранением
console.log('PUT /api/participants/[participantId]', {
  participantId,
  canonicalId,
  updatePayload,
  hasCustomAttributes: 'custom_attributes' in updatePayload,
  customAttributesValue: updatePayload.custom_attributes
});

// Логирование после сохранения
console.log('Participant updated successfully:', {
  canonicalId,
  updatedCustomAttributes: updatedParticipant?.custom_attributes
});
```

**Проверка в Vercel Logs**:

После применения миграции вы увидите:
```
PUT /api/participants/[participantId] {
  participantId: "...",
  canonicalId: "...",
  hasCustomAttributes: true,
  customAttributesValue: { "Должность": "Менеджер" }
}

Participant updated successfully: {
  canonicalId: "...",
  updatedCustomAttributes: { "Должность": "Менеджер" }
}
```

## Workflow после исправления

### До миграции (не работало):

```
1. Пользователь добавляет характеристику "Должность" = "Менеджер"
2. Frontend обновляет state → характеристика отображается ✅
3. Frontend отправляет PUT /api/participants/[id]
4. API пытается UPDATE participants SET custom_attributes = '{"Должность":"Менеджер"}'
5. ❌ PostgreSQL: "column custom_attributes does not exist" (молча игнорируется)
6. API возвращает 200 OK (без ошибки)
7. Пользователь уходит со страницы
8. Возвращается → данные загружаются из БД
9. ❌ custom_attributes = null → характеристика исчезла
```

### После миграции (работает):

```
1. Пользователь добавляет характеристику "Должность" = "Менеджер"
2. Frontend обновляет state → характеристика отображается ✅
3. Frontend отправляет PUT /api/participants/[id]
4. API выполняет UPDATE participants SET custom_attributes = '{"Должность":"Менеджер"}'
5. ✅ PostgreSQL: поле существует, данные сохранены
6. API возвращает 200 OK с обновленными данными
7. Пользователь уходит со страницы
8. Возвращается → данные загружаются из БД
9. ✅ custom_attributes = {"Должность":"Менеджер"} → характеристика отображается!
```

## Тестирование

### Тест 1: Добавление характеристики

```
1. Применить миграцию 27
2. Открыть профиль участника
3. Нажать "Редактировать"
4. Добавить: "Должность" = "Менеджер"
5. Нажать "Сохранить"
6. ✅ Характеристика отображается
7. Уйти на другую страницу
8. Вернуться в профиль
9. ✅ Характеристика все еще отображается
```

### Тест 2: Множественные характеристики

```
1. Добавить несколько характеристик:
   - "Должность" = "Менеджер"
   - "Город" = "Москва"
   - "Опыт" = "5 лет"
2. Сохранить
3. Перезагрузить страницу
4. ✅ Все характеристики отображаются
```

### Тест 3: Редактирование характеристики

```
1. Изменить существующую характеристику
2. "Должность" = "Менеджер" → "Директор"
3. Сохранить
4. Перезагрузить
5. ✅ Обновленное значение сохранилось
```

### Тест 4: Удаление характеристики

```
1. Удалить характеристику (кнопка с корзиной)
2. Сохранить
3. Перезагрузить
4. ✅ Характеристика удалена навсегда
```

## Проверка в БД

После добавления характеристики проверьте в Supabase SQL Editor:

```sql
-- Посмотреть custom_attributes конкретного участника
SELECT 
  id, 
  full_name, 
  custom_attributes
FROM participants
WHERE id = 'YOUR_PARTICIPANT_ID';

-- Найти всех участников с заполненными характеристиками
SELECT 
  id, 
  full_name, 
  custom_attributes
FROM participants
WHERE custom_attributes IS NOT NULL 
  AND custom_attributes != '{}'::jsonb
LIMIT 10;

-- Поиск по характеристикам (с использованием GIN индекса)
SELECT 
  id, 
  full_name, 
  custom_attributes->>'Должность' as position
FROM participants
WHERE custom_attributes ? 'Должность';
```

## Преимущества JSONB

### 1. Гибкость схемы

```sql
-- Можно хранить любые ключи без изменения схемы
custom_attributes = {
  "Должность": "Менеджер",
  "Город": "Москва",
  "Хобби": "Футбол",
  "Любое поле": "Любое значение"
}
```

### 2. Индексация и поиск

```sql
-- Быстрый поиск по ключам
WHERE custom_attributes ? 'Должность'

-- Поиск по значениям
WHERE custom_attributes->>'Город' = 'Москва'

-- Поиск по нескольким условиям
WHERE custom_attributes @> '{"Должность": "Менеджер"}'::jsonb
```

### 3. Атомарные операции

```sql
-- Добавить одно поле без перезаписи всего JSON
UPDATE participants
SET custom_attributes = custom_attributes || '{"Новое поле": "Значение"}'::jsonb
WHERE id = '...';

-- Удалить одно поле
UPDATE participants
SET custom_attributes = custom_attributes - 'Ненужное поле'
WHERE id = '...';
```

## Альтернативы (не рекомендуются)

### Вариант 1: participant_traits таблица (уже есть)

**Уже используется для**:
- Характеристик из объединения дубликатов
- Технических характеристик с метаданными
- Аудит и история изменений

**Не подходит для ручных характеристик**, так как:
- Требует отдельные запросы для каждой характеристики
- Сложнее редактировать сразу несколько значений
- Избыточность для простых key-value пар

### Вариант 2: Отдельные колонки

```sql
ALTER TABLE participants
ADD COLUMN position text,
ADD COLUMN city text,
ADD COLUMN hobby text;
```

**Недостатки**:
- Нужно заранее знать все возможные поля
- Миграция при каждом новом поле
- Негибко для разных организаций

**JSONB идеален для нашего случая!**

## Измененные файлы

1. ✅ `db/migrations/27_add_custom_attributes.sql` - новая миграция
2. ✅ `app/api/participants/[participantId]/route.ts` - добавлено логирование
3. 📄 `CUSTOM_ATTRIBUTES_FIX.md` - эта документация

## Заключение

Проблема была в отсутствии поля `custom_attributes` в схеме базы данных. Поле существовало в TypeScript типах и использовалось в коде, но физически отсутствовало в PostgreSQL.

После применения миграции 27:
- ✅ Поле `custom_attributes` добавлено в таблицу `participants`
- ✅ Создан GIN индекс для быстрого поиска
- ✅ Характеристики корректно сохраняются в БД
- ✅ Данные персистентны при перезагрузке страницы
- ✅ Добавлено логирование для отладки

**Теперь все работает правильно!** 🎉

