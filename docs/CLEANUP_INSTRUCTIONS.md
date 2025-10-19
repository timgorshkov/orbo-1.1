# Инструкции по очистке проекта

## 📋 Задачи

1. ✅ Переместить все .md файлы из корня в /docs
2. ✅ Очистить все таблицы БД для тестирования с нуля
3. ✅ Очистить Supabase Auth (пользователи)

## 1️⃣ Перемещение .md файлов

### Файлы для перемещения (65 файлов):

Из корня в `docs/`:
- APPLY_MIGRATION_06.md
- APPLY_MIGRATIONS_30_32.md
- AUTH_MEMBERSHIP_CHECK_FIX.md
- BIO_FIELD_IMPLEMENTATION.md
- BUGFIXES_AUTH_LOGOUT.md
- CUSTOM_ATTRIBUTES_FIX.md
- DASHBOARD_ACTIVITY_FIX.md
- DASHBOARD_SETUP.md
- DEBUG_BOT_AUTH.md
- EVENT_ACCESS_FIX.md
- EVENT_ACCESS_LOGIC.md
- EVENT_REGISTRATION_FIX.md
- EVENT_SHARING_SETUP.md
- EVENTS_SETUP.md
- FINAL_UX_UPDATES.md
- FIXES_SUMMARY.md
- LOGOUT_SESSION_MANAGEMENT.md
- MATERIALS_UX_IMPROVEMENTS.md
- MEMBER_ACCESS_COMPLETE.md
- MEMBER_ACCESS_PLAN.md
- MEMBER_ACCESS_SETUP.md
- MEMBER_AUTH_DESIGN.md
- MEMBER_INTERFACE_GUIDE.md
- MEMBER_MEMBERSHIP_FIX.md
- MEMBER_PROFILE_REDESIGN.md
- MEMBERS_FIX.md
- MERGE_DIRECTION_FIX.md
- MERGE_ERROR_FIX.md
- MERGE_FIX_INSTRUCTIONS.md
- MERGE_FULL_FIX.md
- MERGE_UI_REFINEMENTS.md
- MIGRATION_TO_APP_ORBO_RU.md
- ORG_SETTINGS_SETUP.md
- PARAMS_PROMISE_FIX.md
- PARTICIPANT_DUPLICATES_FIX.md
- PARTICIPANT_DUPLICATION_ANALYSIS.md
- PARTICIPANT_DUPLICATION_FIX_SUMMARY.md
- PARTICIPANT_MESSAGES_IMPLEMENTATION.md
- PARTICIPANT_MESSAGES_STORAGE_PLAN.md
- PARTICIPANT_PHOTOS_SETUP.md
- PUBLIC_PAGE_COOKIES_FIX.md
- SETUP_GUIDE.md
- SETUP_INSTRUCTIONS.md
- SMART_MERGE_IMPLEMENTATION.md
- SMART_MERGE_SETUP.md
- TELEGRAM_ADMINS_COMPREHENSIVE_FIX.md
- TELEGRAM_ANALYTICS_ACTIVITY_FIX.md
- TELEGRAM_ANALYTICS_FIX.md
- TELEGRAM_ANALYTICS_MEMBER_COUNT_FIX.md
- TELEGRAM_ANALYTICS_SETUP.md
- TELEGRAM_AUTH_COMPLETE.md
- TELEGRAM_AUTH_DIRECT_FETCH_FIX.md
- TELEGRAM_AUTH_FIX.md
- TELEGRAM_AUTH_STATUS.md
- TELEGRAM_BOT_SETUP.md
- TELEGRAM_BOTS_ROLE_FIX.md
- TELEGRAM_GROUP_MAPPING_FIX.md
- TELEGRAM_GROUP_MEMBER_AUTH.md
- TELEGRAM_GROUPS_AVAILABILITY_FIX.md
- TELEGRAM_GROUPS_DELETE_AND_SHARE_FIX.md
- TELEGRAM_GROUPS_DISPLAY_FIX.md
- TELEGRAM_GROUPS_FIX.md
- TELEGRAM_INFRASTRUCTURE_SOLUTIONS.md
- TELEGRAM_OWNERSHIP_ARCHITECTURE.md
- TELEGRAM_WEBHOOK_SETUP.md
- TERMINOLOGY_UPDATES.md
- THREE_FIXES_SUMMARY.md
- UI_UNIFICATION.md
- UX_FIXES_COMPLETE.md
- UX_FIXES_SUMMARY.md
- UX_IMPROVEMENTS_SUMMARY.md
- WEBHOOK_AND_BOT_AUTH_IMPLEMENTATION.md
- WEBHOOK_FIX_GUIDE.md
- WEBHOOK_SECRET_FIX.md

### Команды PowerShell для перемещения:

```powershell
# Переместить все .md файлы из корня в docs/ (кроме prd.md и README.md)
Get-ChildItem -Path "C:\Cursor WS\orbo-1.1" -Filter "*.md" -File | 
  Where-Object { $_.Name -ne "prd.md" -and $_.Name -ne "README.md" } | 
  Move-Item -Destination "C:\Cursor WS\orbo-1.1\docs\" -Force
```

### Перемещение SQL файлов для дубликатов:

Из корня в `db/`:
- FIX_ALL_DUPLICATES_BEFORE_INDEXES.sql
- FIX_DUPLICATE_PARTICIPANTS_BEFORE_MIGRATION.sql
- FIX_EMPTY_EMAIL_DUPLICATES.sql

```powershell
# Переместить SQL файлы фиксов
Move-Item "C:\Cursor WS\orbo-1.1\FIX_*.sql" -Destination "C:\Cursor WS\orbo-1.1\db\" -Force
```

## 2️⃣ Очистка таблиц БД

### ⚠️ ВАЖНО: Порядок удаления

Из-за foreign keys нужно удалять в правильном порядке.

### Скрипт полной очистки

```sql
-- ==========================================
-- ПОЛНАЯ ОЧИСТКА БД ДЛЯ ТЕСТИРОВАНИЯ С НУЛЯ
-- ==========================================
-- ВНИМАНИЕ: Это удалит ВСЕ данные!
-- Структура таблиц сохранится, удалятся только данные.

BEGIN;

-- 1. Временно отключаем триггеры (опционально, для ускорения)
SET session_replication_role = replica;

-- 2. Удаляем данные из зависимых таблиц (от самых зависимых к независимым)

-- Activity & Events
TRUNCATE TABLE activity_events CASCADE;
TRUNCATE TABLE event_registrations CASCADE;
TRUNCATE TABLE events CASCADE;

-- Materials
TRUNCATE TABLE material_pages CASCADE;

-- Participants & Merging
TRUNCATE TABLE participant_merge_history CASCADE;
TRUNCATE TABLE participant_groups CASCADE;
TRUNCATE TABLE participants CASCADE;

-- Telegram
TRUNCATE TABLE telegram_group_admins CASCADE;
TRUNCATE TABLE user_telegram_accounts CASCADE;
TRUNCATE TABLE telegram_auth_codes CASCADE;
TRUNCATE TABLE org_telegram_groups CASCADE;
TRUNCATE TABLE telegram_groups CASCADE;

-- Group Metrics
TRUNCATE TABLE group_metrics CASCADE;

-- Invitations
TRUNCATE TABLE invitations CASCADE;

-- Memberships
TRUNCATE TABLE memberships CASCADE;

-- Organizations
TRUNCATE TABLE organizations CASCADE;

-- 3. Включаем триггеры обратно
SET session_replication_role = DEFAULT;

-- 4. Сбрасываем sequences (если нужны ID с 1)
-- Раскомментируйте, если хотите начать ID с 1
-- ALTER SEQUENCE IF EXISTS events_id_seq RESTART WITH 1;
-- ALTER SEQUENCE IF EXISTS telegram_groups_id_seq RESTART WITH 1;
-- и т.д. для всех sequences

COMMIT;

-- Проверяем, что таблицы пустые
SELECT 
  'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'memberships', COUNT(*) FROM memberships
UNION ALL
SELECT 'participants', COUNT(*) FROM participants
UNION ALL
SELECT 'telegram_groups', COUNT(*) FROM telegram_groups
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'event_registrations', COUNT(*) FROM event_registrations
UNION ALL
SELECT 'material_pages', COUNT(*) FROM material_pages
UNION ALL
SELECT 'user_telegram_accounts', COUNT(*) FROM user_telegram_accounts;
```

### Альтернатива: Удаление по организациям

Если хотите оставить структуру, но удалить только тестовые организации:

```sql
-- Удаляем конкретные организации
DO $$
DECLARE
  org_to_delete UUID;
BEGIN
  -- Замените на ID организаций для удаления
  FOR org_to_delete IN 
    SELECT id FROM organizations 
    WHERE name LIKE '%test%' OR name LIKE '%тест%'
  LOOP
    RAISE NOTICE 'Deleting organization: %', org_to_delete;
    
    -- Удаляем все связанные данные
    DELETE FROM activity_events WHERE org_id = org_to_delete;
    DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE org_id = org_to_delete);
    DELETE FROM events WHERE org_id = org_to_delete;
    DELETE FROM material_pages WHERE org_id = org_to_delete;
    DELETE FROM participant_merge_history WHERE org_id = org_to_delete;
    DELETE FROM participant_groups WHERE org_id = org_to_delete;
    DELETE FROM participants WHERE org_id = org_to_delete;
    DELETE FROM user_telegram_accounts WHERE org_id = org_to_delete;
    DELETE FROM org_telegram_groups WHERE org_id = org_to_delete;
    DELETE FROM invitations WHERE org_id = org_to_delete;
    DELETE FROM memberships WHERE org_id = org_to_delete;
    DELETE FROM organizations WHERE id = org_to_delete;
  END LOOP;
END $$;
```

## 3️⃣ Очистка Supabase Auth (Пользователи)

### Вариант A: Через Supabase Dashboard

1. Откройте Supabase Dashboard
2. Перейдите в **Authentication → Users**
3. Выберите всех пользователей
4. Нажмите **Delete users**

### Вариант B: Через SQL (Service Role)

⚠️ **ВНИМАНИЕ:** Это необратимо удалит ВСЕХ пользователей!

```sql
-- Удалить всех пользователей из auth.users
-- Это также удалит связанные данные (sessions, refresh_tokens и т.д.)
DELETE FROM auth.users;

-- Проверить
SELECT COUNT(*) FROM auth.users;
```

### Вариант C: Через SQL (выборочно)

Удалить только тестовых пользователей:

```sql
-- Удалить пользователей с тестовыми email
DELETE FROM auth.users 
WHERE email LIKE '%test%' 
   OR email LIKE '%+test%'
   OR email LIKE '%example.com';

-- Или удалить пользователей, зарегистрированных после определенной даты
DELETE FROM auth.users 
WHERE created_at > '2025-01-01';
```

### Что происходит при удалении пользователя:

1. ✅ Удаляется запись из `auth.users`
2. ✅ Автоматически удаляются:
   - `auth.identities` (связанные идентичности)
   - `auth.sessions` (активные сессии)
   - `auth.refresh_tokens` (токены)
3. ⚠️ **Memberships НЕ удаляются автоматически** (foreign key с ON DELETE CASCADE нет)
   - Нужно удалить вручную (см. скрипт выше)

### ✨ Автоматическая очистка невалидных токенов

**ВАЖНО:** После очистки БД в браузерах пользователей могут остаться старые JWT токены. Не волнуйтесь!

✅ **Приложение автоматически обрабатывает этот случай:**

1. При попытке доступа с невалидным токеном:
   - Обнаруживается ошибка `invalid claim: missing sub claim`
   - Автоматически очищаются все Supabase cookies
   - Пользователь перенаправляется на `/signin`

2. Это работает на всех защищённых страницах:
   - Корневая страница (`/`)
   - Страница выбора организаций (`/orgs`)
   - Все внутренние страницы приложения

**Никаких дополнительных действий не требуется!** 🎉

Подробнее см. [`AUTH_TOKEN_CLEANUP_FIX.md`](./AUTH_TOKEN_CLEANUP_FIX.md)

### Рекомендуемый порядок очистки:

```sql
BEGIN;

-- 1. Сначала очищаем application данные
TRUNCATE TABLE activity_events CASCADE;
TRUNCATE TABLE event_registrations CASCADE;
TRUNCATE TABLE events CASCADE;
TRUNCATE TABLE material_pages CASCADE;
TRUNCATE TABLE participant_merge_history CASCADE;
TRUNCATE TABLE participant_groups CASCADE;
TRUNCATE TABLE participants CASCADE;
TRUNCATE TABLE telegram_group_admins CASCADE;
TRUNCATE TABLE user_telegram_accounts CASCADE;
TRUNCATE TABLE telegram_auth_codes CASCADE;
TRUNCATE TABLE org_telegram_groups CASCADE;
TRUNCATE TABLE telegram_groups CASCADE;
TRUNCATE TABLE group_metrics CASCADE;
TRUNCATE TABLE invitations CASCADE;
TRUNCATE TABLE memberships CASCADE;
TRUNCATE TABLE organizations CASCADE;

-- 2. Затем удаляем пользователей из auth
DELETE FROM auth.users;

-- 3. Проверяем
SELECT 'users' as table_name, COUNT(*) FROM auth.users
UNION ALL
SELECT 'organizations', COUNT(*) FROM organizations;

COMMIT;
```

## 4️⃣ Проверка после очистки

### Убедитесь, что все таблицы пустые:

```sql
-- Полная проверка всех основных таблиц
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as exists,
  -- Подсчет строк (для небольших таблиц)
  CASE 
    WHEN tablename = 'organizations' THEN (SELECT COUNT(*)::text FROM organizations)
    WHEN tablename = 'users' THEN (SELECT COUNT(*)::text FROM auth.users)
    WHEN tablename = 'memberships' THEN (SELECT COUNT(*)::text FROM memberships)
    WHEN tablename = 'participants' THEN (SELECT COUNT(*)::text FROM participants)
    WHEN tablename = 'telegram_groups' THEN (SELECT COUNT(*)::text FROM telegram_groups)
    WHEN tablename = 'events' THEN (SELECT COUNT(*)::text FROM events)
    ELSE '-'
  END as row_count
FROM pg_tables
WHERE schemaname IN ('public', 'auth')
  AND tablename IN (
    'organizations', 'memberships', 'participants', 
    'telegram_groups', 'events', 'users',
    'user_telegram_accounts', 'material_pages'
  )
ORDER BY schemaname, tablename;
```

### Проверка Storage (фото участников):

```sql
-- Проверить, есть ли файлы в Storage buckets
SELECT 
  name as bucket_name,
  public,
  created_at
FROM storage.buckets;

-- Посмотреть файлы в participant-photos
SELECT 
  name,
  bucket_id,
  owner,
  created_at,
  pg_size_pretty(metadata->>'size') as size
FROM storage.objects
WHERE bucket_id = 'participant-photos'
LIMIT 100;
```

### Очистка Storage (если нужно):

```sql
-- ВНИМАНИЕ: Удалит все файлы из bucket!
DELETE FROM storage.objects 
WHERE bucket_id = 'participant-photos';
```

## 5️⃣ Тестирование после очистки

### Чек-лист для проверки:

- [ ] Все таблицы пустые (COUNT = 0)
- [ ] Нет пользователей в `auth.users`
- [ ] Можно создать новую организацию
- [ ] Можно зарегистрироваться как новый пользователь
- [ ] Можно привязать Telegram аккаунт
- [ ] Можно подключить Telegram группу
- [ ] Можно создать событие
- [ ] Можно создать материал

### Первые шаги после очистки:

1. **Создать первую организацию:**
   - Зарегистрироваться: `/signup`
   - Создать организацию: `/app/create-organization`

2. **Настроить Telegram:**
   - Привязать Telegram аккаунт: `/app/[org]/telegram/account`
   - Подключить группу: `/app/[org]/telegram`

3. **Протестировать основные функции:**
   - Создать событие
   - Создать материал
   - Пригласить участника
   - Проверить аналитику

## 6️⃣ Бэкап перед очисткой (рекомендуется)

Если хотите сохранить данные перед очисткой:

```bash
# В PowerShell
# Экспорт всей БД
pg_dump $env:DATABASE_URL > backup_before_cleanup_$(Get-Date -Format 'yyyy-MM-dd').sql

# Или только данные (без структуры)
pg_dump --data-only $env:DATABASE_URL > backup_data_only.sql
```

Восстановление:
```bash
psql $env:DATABASE_URL < backup_before_cleanup_2025-01-20.sql
```

## 🎯 Итого

После выполнения всех шагов:
- ✅ Все .md файлы в `/docs` (кроме prd.md и README.md)
- ✅ БД полностью чистая
- ✅ Нет пользователей в Supabase Auth
- ✅ Готово к тестированию с нуля

## 📞 Поддержка

Если что-то пошло не так:
1. Проверьте логи Supabase
2. Проверьте Vercel логи
3. Проверьте, что все миграции применены
4. Восстановите из бэкапа, если нужно

