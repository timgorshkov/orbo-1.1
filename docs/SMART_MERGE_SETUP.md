# Установка умного объединения участников

## Краткая инструкция

### 1. Применить миграцию

**Через Supabase Dashboard**:
```
1. Открыть проект в Supabase Dashboard
2. SQL Editor → New query
3. Скопировать содержимое db/migrations/25_merge_participants_smart.sql
4. Вставить и нажать Run
```

**Через CLI**:
```bash
cd db/migrations
supabase db push
```

### 2. Проверить установку

```sql
-- Проверить, что функция создана
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'merge_participants_smart';
```

Должна вернуться 1 строка с функцией.

### 3. Тестирование

#### Тест 1: Простое объединение
```sql
-- Создать тестовых участников
INSERT INTO participants (org_id, full_name, email, phone)
VALUES 
  ('your-org-id', 'Иван Петров', 'ivan@test.com', NULL),
  ('your-org-id', 'Иван', NULL, '+79991234567');

-- Получить их ID
SELECT id, full_name, email, phone FROM participants 
WHERE org_id = 'your-org-id' AND full_name LIKE 'Иван%';

-- Объединить (вставить реальные UUID)
SELECT merge_participants_smart(
  'target-uuid'::uuid,
  ARRAY['duplicate-uuid']::uuid[],
  'admin-user-id'::uuid
);

-- Проверить результат
SELECT full_name, email, phone FROM participants WHERE id = 'target-uuid';
-- Должно быть: full_name='Иван Петров', email='ivan@test.com', phone='+79991234567'
```

#### Тест 2: Конфликты
```sql
-- Создать участников с конфликтующими полями
INSERT INTO participants (org_id, full_name, email, phone)
VALUES 
  ('your-org-id', 'Иван Петров', 'ivan@test.com', '+79991111111'),
  ('your-org-id', 'Петров И.', 'ivan.p@test.com', '+79992222222');

-- Объединить
SELECT merge_participants_smart(
  'target-uuid'::uuid,
  ARRAY['duplicate-uuid']::uuid[],
  'admin-user-id'::uuid
);

-- Проверить конфликты в характеристиках
SELECT trait_key, trait_value, metadata 
FROM participant_traits
WHERE participant_id = 'target-uuid' AND source = 'merge';

-- Должно быть несколько записей типа:
-- trait_key='full_name_merged', trait_value='Петров И.'
-- trait_key='email_merged', trait_value='ivan.p@test.com'
-- trait_key='phone_merged', trait_value='+79992222222'
```

### 4. Очистка тестовых данных

```sql
-- Удалить тестовых участников
DELETE FROM participants 
WHERE org_id = 'your-org-id' 
  AND full_name LIKE 'Иван%';

-- Удалить тестовые характеристики
DELETE FROM participant_traits 
WHERE source = 'merge' 
  AND created_at > NOW() - INTERVAL '1 hour';
```

## Использование через UI

1. Открыть профиль участника
2. Перейти на вкладку "Дубликаты"
3. Выбрать дубликата из списка
4. Нажать "Объединить выбранного участника"
5. Увидеть сообщение с результатами:
   ```
   Профили успешно объединены!
   
   Заполнено полей: 2
     • email: ivan@example.com
     • phone: +79991234567
   
   Конфликтующих значений: 1
   Они сохранены в характеристиках:
     • full_name: "Петров И." → сохранено как "full_name_merged"
   ```

## Откат (если нужно)

Если новая функция работает некорректно, можно вернуться к старой:

```sql
-- Удалить новую функцию
DROP FUNCTION IF EXISTS public.merge_participants_smart(uuid, uuid[], uuid);
```

Код автоматически будет использовать старую функцию `merge_participants_extended`.

## Проблемы и решения

### Проблема: "function merge_participants_smart does not exist"

**Решение**: Миграция не применена. Примените `25_merge_participants_smart.sql`.

### Проблема: "column participant_traits does not exist"

**Решение**: Таблица характеристик не создана. Примените миграции в порядке:
1. `08_participant_traits.sql`
2. `25_merge_participants_smart.sql`

### Проблема: Конфликты не сохраняются

**Проверьте**:
```sql
-- Права на таблицу participant_traits
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='participant_traits';
```

## Мониторинг

После установки следите за:

### Количество конфликтов
```sql
SELECT COUNT(*) as total_conflicts
FROM participant_traits
WHERE source = 'merge';
```

### Топ полей с конфликтами
```sql
SELECT 
  metadata->>'original_field' as field,
  COUNT(*) as count
FROM participant_traits
WHERE source = 'merge'
GROUP BY field
ORDER BY count DESC;
```

### Недавние объединения
```sql
SELECT 
  p.id,
  p.full_name,
  COUNT(pt.id) as conflicts
FROM participants p
LEFT JOIN participant_traits pt ON pt.participant_id = p.id AND pt.source = 'merge'
WHERE p.updated_at > NOW() - INTERVAL '24 hours'
GROUP BY p.id, p.full_name
ORDER BY p.updated_at DESC
LIMIT 10;
```

## Документация

- **Полное описание**: `SMART_MERGE_IMPLEMENTATION.md`
- **SQL миграция**: `db/migrations/25_merge_participants_smart.sql`
- **API endpoint**: `app/api/participants/[participantId]/route.ts`
- **UI компонент**: `components/members/participant-duplicates-card.tsx`

## Поддержка

При возникновении проблем:
1. Проверить логи Supabase (Logs → Postgres Logs)
2. Проверить, что функция создана (см. "Проверить установку")
3. Протестировать на тестовых данных (см. "Тестирование")
4. При необходимости откатить изменения (см. "Откат")

