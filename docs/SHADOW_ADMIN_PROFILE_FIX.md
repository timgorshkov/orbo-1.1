# Shadow Admin Profile Fix - Отображение данных участников

## Проблема
После создания shadow профилей для Telegram админов:
1. В "Команда организации" вместо имени админа отображалось "Администратор"
2. В разделе "Профиль" не подтягивались данные участника
3. Редактирование профиля не работало для shadow профилей

## Причина
- View `organization_admins` брал данные только из `user_telegram_accounts`, но у shadow админов там нет записи
- API `/api/user/profile` искал `participant` только по `telegram_user_id` из `user_telegram_accounts`
- Страница профиля не учитывала `username` и `tg_user_id` из `participant` при формировании `displayName`

## Решение

### 1. Обновлен view `organization_admins` (миграция 55)
**Файл:** `db/migrations/55_fix_organization_admins_use_participants.sql`

**Изменения:**
- Добавлен `LEFT JOIN participants` для получения данных shadow профилей
- Обновлена логика `full_name`: приоритет `participants.full_name` > `user_telegram_accounts`
- Обновлена логика `telegram_username`: `COALESCE(uta.telegram_username, p.username)`
- Обновлена логика `tg_user_id`: `COALESCE(uta.telegram_user_id, p.tg_user_id)`

```sql
-- Приоритет: participants > user_telegram_accounts > email
COALESCE(
  p.full_name,
  NULLIF(TRIM(CONCAT(uta.telegram_first_name, ' ', uta.telegram_last_name)), ''),
  uta.telegram_first_name,
  u.email,
  'Администратор'
) as full_name
```

### 2. Обновлен API профиля
**Файл:** `app/api/user/profile/route.ts`

**Изменения в GET:**
- Добавлен fallback поиск `participant` по `user_id`, если не найден по `telegram_user_id`
- Теперь shadow профили могут видеть свои данные участника

```typescript
// Сначала пробуем найти по telegram_user_id
if (telegramAccount?.telegram_user_id) {
  // ...
}

// Если не нашли, пробуем найти по user_id (для shadow профилей)
if (!participant) {
  const { data: participantData } = await adminSupabase
    .from('participants')
    .select('...')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .is('merged_into', null)
    .maybeSingle();
  
  participant = participantData;
}
```

**Изменения в PATCH:**
- Аналогичный fallback для редактирования профиля
- Поиск по `user_id`, если нет `telegramAccount`

### 3. Обновлена страница профиля
**Файл:** `app/app/[org]/profile/page.tsx`

**Изменения:**
- Обновлена логика `displayName` для учета `username` и `tg_user_id` из `participant`

```typescript
const displayName = profile.participant?.full_name || 
                    (profile.participant?.username ? `@${profile.participant.username}` : null) ||
                    (profile.participant?.tg_user_id ? `ID: ${profile.participant.tg_user_id}` : null) ||
                    profile.telegram?.telegram_first_name ||
                    profile.user.email ||
                    'Пользователь'
```

### 4. Обновлена кнопка "Синхронизировать с Telegram"
**Файл:** `app/app/[org]/telegram/account/page.tsx`

**Изменения:**
- Кнопка теперь сначала вызывает обновление прав админов, а затем синхронизацию групп
- Более понятный feedback для пользователя

```typescript
// Шаг 1: Обновляем права администраторов для всех групп
const adminResponse = await fetch('/api/telegram/groups/update-admins', { ... });

// Шаг 2: Синхронизируем группы
const response = await fetch('/api/telegram/groups/sync', { ... });
```

## Применение

### 1. Примените миграцию в Supabase SQL Editor:
```sql
-- Файл: db/migrations/55_fix_organization_admins_use_participants.sql
```

### 2. Задеплойте изменения:
```bash
git add .
git commit -m "fix: отображение данных shadow админов из participants"
git push
```

### 3. Проверка:
После деплоя:
1. Зайдите в "Настройки → Команда организации"
   - Должны быть видны имена всех админов (включая shadow)
2. Зайдите в "Профиль"
   - Должны отображаться данные участника
   - Редактирование должно работать (если email подтвержден)

## Результат

✅ **Команда организации:**
- Отображается полное имя из `participants.full_name`
- Если имени нет → показывается `@username`
- Если username нет → показывается `ID: 123456789`

✅ **Профиль пользователя:**
- Все данные участника подтягиваются корректно (имя, био, контакты, custom_attributes)
- Редактирование профиля работает для всех, кроме shadow админов (без email)

✅ **Кнопка "Синхронизировать с Telegram":**
- Автоматически обновляет права всех админов
- Синхронизирует группы
- Показывает детальный feedback

## Связь с участниками

Теперь профиль пользователя и карточка участника **полностью связаны**:
- Редактирование профиля → обновляется `participants` таблица
- Данные участника отображаются в профиле
- Владелец/админ редактирует свою карточку участника через профиль

## Дата
2025-10-19

## Автор
AI Assistant (Claude Sonnet 4.5)

