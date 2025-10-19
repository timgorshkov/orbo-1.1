# Исправление создания участников (Participants)

## Проблема

После исправления имён колонок (`status` → `participant_status`), участники всё равно не создаются при обработке сообщений.

### Ошибка в логах:
```
Error upserting participant from message: {
  code: '42P10',
  message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification'
}
```

### Причина:
В `EventProcessingService` используется `UPSERT` с `onConflict`:
```typescript
.upsert({
  org_id: orgId,
  tg_user_id: userId,
  // ...
}, {
  onConflict: 'org_id,tg_user_id',  // ❌ Этот constraint не существует!
  ignoreDuplicates: false
})
```

Но в таблице `participants` **нет уникального индекса** на `(org_id, tg_user_id)`.

## Решение

### 1. Создать уникальный индекс

Применить миграцию:
```sql
-- Файл: db/migrations/52_add_unique_constraint_participants.sql
```

Эта миграция создаст уникальный индекс:
```sql
CREATE UNIQUE INDEX participants_org_tg_user_unique 
ON participants (org_id, tg_user_id) 
WHERE merged_into IS NULL AND tg_user_id IS NOT NULL;
```

**Условия индекса:**
- `merged_into IS NULL` — игнорируем объединённых участников
- `tg_user_id IS NOT NULL` — игнорируем участников без Telegram ID

### 2. Логика работы

После создания индекса, `UPSERT` будет работать так:

1. **Первое сообщение** от пользователя:
   - Создаётся новая запись в `participants`
   - Создаётся связь в `participant_groups`
   
2. **Повторные сообщения**:
   - `UPSERT` обновляет существующую запись (по `org_id, tg_user_id`)
   - Связь в `participant_groups` уже существует

3. **Объединённые участники**:
   - Индекс не применяется к ним (`merged_into IS NULL`)
   - Дубликаты не создаются

## Применение исправления

### Шаг 1: Проверить дубликаты (должно быть пусто)

```sql
SELECT 
  org_id,
  tg_user_id,
  COUNT(*) as duplicate_count
FROM participants
WHERE tg_user_id IS NOT NULL
  AND merged_into IS NULL
GROUP BY org_id, tg_user_id
HAVING COUNT(*) > 1;
```

Должно вернуть **0 строк** (таблица пустая).

### Шаг 2: Применить миграцию

В Supabase SQL Editor:
```sql
-- Файл: db/migrations/52_add_unique_constraint_participants.sql
```

### Шаг 3: Проверить индекс

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'participants'
  AND indexname = 'participants_org_tg_user_unique';
```

Должен вернуть:
```
indexname: participants_org_tg_user_unique
indexdef: CREATE UNIQUE INDEX participants_org_tg_user_unique ON public.participants USING btree (org_id, tg_user_id) WHERE ((merged_into IS NULL) AND (tg_user_id IS NOT NULL))
```

### Шаг 4: Отправить сообщение в группе

После применения миграции:
1. Отправьте 1-2 сообщения в любой группе
2. Проверьте логи Vercel — не должно быть ошибки `42P10`
3. Проверьте таблицу:
   ```sql
   SELECT * FROM participants ORDER BY id DESC LIMIT 5;
   ```
4. Зайдите в `/app/[org]/members` — участники должны появиться!

## Проверка результата

### SQL-запросы для диагностики:

```sql
-- 1. Участники по организациям
SELECT 
  p.org_id,
  o.name as org_name,
  COUNT(*) as participant_count
FROM participants p
LEFT JOIN organizations o ON o.id = p.org_id
WHERE p.merged_into IS NULL
GROUP BY p.org_id, o.name
ORDER BY participant_count DESC;

-- 2. Связи участников с группами
SELECT 
  pg.tg_group_id,
  tg.title,
  COUNT(*) as participant_count
FROM participant_groups pg
LEFT JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
WHERE pg.is_active = true
GROUP BY pg.tg_group_id, tg.title
ORDER BY participant_count DESC;

-- 3. Последние созданные участники
SELECT 
  p.id,
  p.org_id,
  p.tg_user_id,
  p.full_name,
  p.username,
  p.source,
  p.participant_status
FROM participants p
WHERE p.merged_into IS NULL
ORDER BY p.id DESC
LIMIT 10;
```

## Дополнительные улучшения

### Обработка ошибок в коде

Текущий код в `EventProcessingService` уже имеет fallback на случай ошибки:

```typescript
if (error) {
  console.error('Error upserting participant from message:', error);
  // Fallback: попытаться получить существующего участника
  const { data: existingParticipant } = await this.supabase
    .from('participants')
    .select('id, merged_into')
    .eq('tg_user_id', userId)
    .eq('org_id', orgId)
    .is('merged_into', null)
    .maybeSingle();
  
  if (existingParticipant) {
    participantId = existingParticipant.merged_into || existingParticipant.id;
    console.log(`Using existing participant with ID ${participantId}`);
  }
}
```

После создания индекса этот fallback больше не нужен, но оставляем для надёжности.

## Файлы, затронутые изменениями

1. **Миграция:** `db/migrations/52_add_unique_constraint_participants.sql`
2. **Документация:** `docs/PARTICIPANTS_CREATION_FIX.md` (этот файл)
3. **Диагностика:** `db/CHECK_PARTICIPANTS_CONSTRAINTS.sql`

## История проблемы

1. **Исходная проблема:** Неправильные имена колонок (`status` вместо `participant_status`)
2. **Вторая проблема:** Отсутствие уникального индекса для `UPSERT`
3. **Решение:** Исправлены имена колонок + создан уникальный индекс

## Ожидаемый результат

После применения миграции:
- ✅ Участники создаются при обработке сообщений
- ✅ Связи `participant_groups` создаются автоматически
- ✅ Раздел "Участники" отображает всех участников
- ✅ Статистика групп показывает корректное количество участников
- ✅ Дубликаты не создаются (благодаря уникальному индексу)

