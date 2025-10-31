-- =====================================================
-- ДИАГНОСТИКА БД ДЛЯ SUPABASE SQL EDITOR
-- Все результаты выводятся таблицами (SELECT)
-- =====================================================

-- =====================================================
-- 1. УДАЛЁННЫЕ ТАБЛИЦЫ (Миграция 42)
-- =====================================================
SELECT 
  '1. УДАЛЁННЫЕ ТАБЛИЦЫ' as "Секция",
  t.table_name as "Таблица",
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN '❌ ЕЩЁ СУЩЕСТВУЕТ'
    ELSE '✅ Удалена'
  END as "Статус",
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN 'Миграция 42 НЕ выполнена или код использует таблицу'
    ELSE 'Код может обращаться к несуществующей таблице!'
  END as "Примечание"
FROM (
  VALUES 
    ('telegram_updates'),
    ('telegram_identities'),
    ('telegram_activity_events')
) as t(table_name);

-- =====================================================
-- 2. КОЛОНКА participants.identity_id
-- =====================================================
SELECT 
  '2. КОЛОНКА identity_id' as "Секция",
  'participants.identity_id' as "Колонка",
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'participants'
        AND column_name = 'identity_id'
    ) THEN '❌ ЕЩЁ СУЩЕСТВУЕТ'
    ELSE '✅ Удалена'
  END as "Статус",
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'participants'
        AND column_name = 'identity_id'
    ) THEN 'Миграция 42 не выполнена'
    ELSE 'Код всё ещё содержит типы с identity_id!'
  END as "Примечание";

-- =====================================================
-- 3. СТАРЫЕ ТАБЛИЦЫ МАТЕРИАЛОВ
-- =====================================================
SELECT 
  '3. СТАРЫЕ МАТЕРИАЛЫ' as "Секция",
  table_name as "Таблица",
  CASE WHEN table_exists THEN '❌ СУЩЕСТВУЕТ' ELSE '✅ Удалена' END as "Статус",
  '-' as "Записей",
  CASE 
    WHEN NOT table_exists THEN 'Удалена миграцией 49'
    WHEN table_name IN ('material_folders', 'material_items') THEN 'Можно удалить (миграция 49 есть)'
    ELSE 'Можно удалить (не используется)'
  END as "Рекомендация"
FROM (
  SELECT 
    t.table_name,
    EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) as table_exists
  FROM (VALUES 
    ('material_folders'),
    ('material_items'),
    ('material_access')
  ) as t(table_name)
) as material_check;

-- =====================================================
-- 4. profiles.telegram_user_id
-- =====================================================
SELECT 
  '4. profiles.telegram_user_id' as "Секция",
  'profiles.telegram_user_id' as "Колонка",
  CASE WHEN column_exists THEN '❌ СУЩЕСТВУЕТ' ELSE '✅ Удалена' END as "Статус",
  '-' as "Данных",
  CASE 
    WHEN NOT column_exists THEN 'Уже удалена'
    ELSE 'Безопасно удалить (дубль user_telegram_accounts)'
  END as "Рекомендация"
FROM (
  SELECT 
    EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'profiles'
        AND column_name = 'telegram_user_id'
    ) as column_exists
) as profile_check;

-- =====================================================
-- 5. НОВЫЕ ТАБЛИЦЫ (замены старых)
-- =====================================================
SELECT 
  '5. НОВЫЕ ТАБЛИЦЫ' as "Секция",
  table_name as "Таблица",
  total_records as "Записей",
  orgs as "Организаций",
  extra_info as "Дополнительно"
FROM (
  SELECT 
    'activity_events' as table_name,
    COUNT(*)::text as total_records,
    COUNT(DISTINCT org_id)::text as orgs,
    COUNT(DISTINCT tg_chat_id)::text || ' групп' as extra_info,
    1 as sort_order
  FROM activity_events
  
  UNION ALL
  
  SELECT 
    'user_telegram_accounts' as table_name,
    COUNT(*)::text as total_records,
    COUNT(DISTINCT org_id)::text as orgs,
    COUNT(DISTINCT user_id)::text || ' пользователей' as extra_info,
    2 as sort_order
  FROM user_telegram_accounts
  
  UNION ALL
  
  SELECT 
    'material_pages' as table_name,
    COUNT(*)::text as total_records,
    COUNT(DISTINCT org_id)::text as orgs,
    '-' as extra_info,
    3 as sort_order
  FROM material_pages
) as t
ORDER BY sort_order;

-- =====================================================
-- 6. ИТОГОВЫЕ РЕКОМЕНДАЦИИ
-- =====================================================
WITH checks AS (
  SELECT 
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_updates') as telegram_updates_exists,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'telegram_identities') as telegram_identities_exists,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'identity_id') as identity_id_exists,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'material_folders') as material_folders_exists,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'telegram_user_id') as profiles_tg_id_exists
)
SELECT 
  '6. ИТОГО' as "Секция",
  проблема as "Проблема",
  статус as "Статус",
  действие as "Что делать"
FROM (
  SELECT 
    1 as sort_order,
    'Миграция 42 (telegram_updates, telegram_identities)' as проблема,
    CASE 
      WHEN telegram_updates_exists OR telegram_identities_exists OR identity_id_exists 
      THEN '❌ НЕ выполнена'
      ELSE '✅ Выполнена'
    END as статус,
    CASE 
      WHEN telegram_updates_exists OR telegram_identities_exists OR identity_id_exists 
      THEN 'Код работает, НО обращается к таблицам! Удалить ТОЛЬКО мёртвый код'
      ELSE 'Код обращается к НЕСУЩЕСТВУЮЩИМ таблицам! Удалить мёртвый код СРОЧНО'
    END as действие
  FROM checks
  
  UNION ALL
  
  SELECT 
    2 as sort_order,
    'Старые таблицы материалов (material_folders/items)' as проблема,
    CASE 
      WHEN material_folders_exists THEN '⚠️ Существуют'
      ELSE '✅ Удалены'
    END as статус,
    CASE 
      WHEN material_folders_exists THEN 'Безопасно удалить (миграция 49 есть, код не использует)'
      ELSE 'Всё в порядке'
    END as действие
  FROM checks
  
  UNION ALL
  
  SELECT 
    3 as sort_order,
    'profiles.telegram_user_id' as проблема,
    CASE 
      WHEN profiles_tg_id_exists THEN '⚠️ Существует'
      ELSE '✅ Удалена'
    END as статус,
    CASE 
      WHEN profiles_tg_id_exists THEN 'Безопасно удалить (код НЕ использует, дубль user_telegram_accounts)'
      ELSE 'Всё в порядке'
    END as действие
  FROM checks
) as recommendations
ORDER BY sort_order;

