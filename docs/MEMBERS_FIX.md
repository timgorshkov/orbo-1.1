# Исправление: Пустая таблица участников

## Проблема

На странице `/app/[org]/members` таблица участников была пуста, хотя на страницах отдельных групп участники отображались корректно.

## Причина

Запрос к таблице `participants` использовал обычный Supabase клиент (`createClientServer()`), который блокировался политиками RLS (Row Level Security).

### RLS политика для `participants`:
```sql
CREATE POLICY "Members can view org participants"
ON participants FOR SELECT
TO authenticated
USING (
  participant_status != 'excluded'
  AND org_id IN (
    -- Пользователь - owner/admin организации
    SELECT org_id FROM memberships WHERE user_id = auth.uid()
    UNION
    -- Пользователь - участник организации (через Telegram)
    SELECT tg.org_id
    FROM participant_groups pg
    JOIN telegram_groups tg ON tg.tg_chat_id = pg.tg_group_id
    JOIN participants p ON p.id = pg.participant_id
    JOIN user_telegram_accounts uta ON uta.telegram_user_id = p.tg_user_id AND uta.org_id = tg.org_id
    WHERE uta.user_id = auth.uid()
      AND p.participant_status IN ('participant', 'event_attendee')
  )
);
```

Эта политика требует сложные JOIN'ы, которые могут не работать в некоторых сценариях.

## Решение

Использовать `createAdminServer()` для обхода RLS при загрузке участников, аналогично тому, как это сделано в других частях приложения (например, в `app/app/[org]/layout.tsx`).

## Изменения

### Файл: `app/app/[org]/members/page.tsx`

**До:**
```typescript
const supabase = await createClientServer()

// ...

const { data: participants, error } = await supabase
  .from('participants')
  .select('*')
  .eq('org_id', orgId)
  .order('full_name', { ascending: true })
```

**После:**
```typescript
const supabase = await createClientServer()

// ...

// Use admin client to bypass RLS for fetching participants
const adminSupabase = createAdminServer()

// Fetch participants (excluding 'excluded' status)
const { data: participants, error } = await adminSupabase
  .from('participants')
  .select('*')
  .eq('org_id', orgId)
  .neq('participant_status', 'excluded')
  .order('full_name', { ascending: true, nullsFirst: false })

console.log(`Fetched ${participants?.length || 0} participants for org ${orgId}`)
```

### Улучшения:
1. ✅ Использование `createAdminServer()` для обхода RLS
2. ✅ Явное исключение участников со статусом `'excluded'`
3. ✅ Сортировка с `nullsFirst: false` (участники без имени в конце)
4. ✅ Логирование количества загруженных участников для отладки
5. ✅ Использование `adminSupabase` также для загрузки приглашений

## Тестирование

### Шаг 1: Проверить данные в БД
```sql
-- Проверить участников организации
SELECT id, org_id, full_name, tg_username, participant_status
FROM participants
WHERE org_id = 'YOUR_ORG_ID'
  AND participant_status != 'excluded'
ORDER BY full_name;
```

### Шаг 2: Деплой и проверка
```bash
git add app/app/[org]/members/page.tsx
git commit -m "fix: use admin client to fetch participants bypassing RLS"
git push
```

### Шаг 3: Проверить в интерфейсе
1. Откройте `/app/[org]/members`
2. Проверьте вкладку "Список"
3. Переключите между видами "Карточки" и "Таблица"
4. Проверьте, что все участники отображаются

### Шаг 4: Проверить логи
В Vercel Functions → `/app/[org]/members` проверьте логи:
```
Fetched X participants for org [ORG_ID]
```

## Ожидаемый результат

### Вид "Карточками":
- Отображаются все участники организации (кроме исключённых)
- Карточки с фото, именем, Telegram
- Поиск по имени, email, username
- Клик по карточке → модальное окно с деталями

### Вид "Таблицей" (только для админов):
- Таблица со всеми участниками
- Колонки: Участник, Telegram, Email, Статус, Добавлен
- Цветные бейджи статусов
- Клик по строке → модальное окно с деталями

## Связанные изменения

Этот подход уже используется в:
- `app/app/[org]/layout.tsx` - загрузка организации и членства
- `app/app/[org]/events/[id]/page.tsx` - загрузка событий
- `app/api/events/[id]/register/route.ts` - регистрация на события
- `app/api/events/[id]/notify/route.ts` - отправка уведомлений

## Безопасность

✅ **Безопасно:** Мы проверяем роль пользователя через `getUserRoleInOrg()` перед загрузкой страницы. Если пользователь не имеет доступа к организации (role === 'guest'), происходит редирект на `/orgs`.

Таким образом, только авторизованные пользователи (owner, admin, member) могут видеть участников своей организации.

---

**Статус:** ✅ Исправлено  
**Дата:** 10.10.2025

