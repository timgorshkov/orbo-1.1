-- =====================================================
-- СКРИПТ ВЫПОЛНЕНИЯ МИГРАЦИЙ ДЛЯ 5 ПАР ГРУПП
-- =====================================================
-- 
-- Этот скрипт выполнит migrate_telegram_chat_id для каждой пары,
-- что:
-- 1. Пометит старую группу как migrated (migrated_to = новый chat_id)
-- 2. Пометит новую группу (migrated_from = старый chat_id)  
-- 3. Перенесёт org_bindings, admins, participants, activity на новый chat_id
-- 4. Удалит старые записи из связанных таблиц
-- =====================================================

-- Сначала проверим связанные данные (запустите отдельно)
SELECT 
    tg.id,
    tg.tg_chat_id,
    tg.title,
    tg.bot_status,
    (SELECT COUNT(*) FROM org_telegram_groups otg WHERE otg.tg_chat_id::text = tg.tg_chat_id::text) as org_bindings,
    (SELECT COUNT(*) FROM telegram_group_admins tga WHERE tga.tg_chat_id::text = tg.tg_chat_id::text) as admin_records,
    (SELECT COUNT(*) FROM activity_events ae WHERE ae.tg_chat_id::text = tg.tg_chat_id::text) as activity_events
FROM telegram_groups tg
WHERE tg.title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY tg.title, tg.tg_chat_id;


-- =====================================================
-- ВЫПОЛНЕНИЕ МИГРАЦИЙ (запустите этот блок целиком)
-- =====================================================

-- Миграция 1: 12313123
SELECT migrate_telegram_chat_id(-5053080135, -1003550271592) as "12313123";

-- Миграция 2: inSales. Финансы и показатели  
SELECT migrate_telegram_chat_id(-649278559, -1003456000878) as "inSales";

-- Миграция 3: Orbo. Рабочий чат
SELECT migrate_telegram_chat_id(-4688272729, -1003485407311) as "Orbo_Chat";

-- Миграция 4: тест 6
SELECT migrate_telegram_chat_id(-5020240850, -1003569294766) as "test6";

-- Миграция 5: тест орбо
SELECT migrate_telegram_chat_id(-5010810556, -1003316089057) as "test_orbo";


-- =====================================================
-- ПРОВЕРКА РЕЗУЛЬТАТА (запустите отдельно)
-- =====================================================
SELECT 
    id,
    tg_chat_id,
    title,
    bot_status,
    migrated_to,
    migrated_from
FROM telegram_groups
WHERE title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY title, tg_chat_id;


-- =====================================================
-- УДАЛЕНИЕ СТАРЫХ ЗАПИСЕЙ (запустите ПОСЛЕ проверки)
-- Старые группы теперь помечены как migrated и не нужны
-- =====================================================
DELETE FROM telegram_groups 
WHERE migrated_to IS NOT NULL 
AND title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123');


-- =====================================================
-- ФИНАЛЬНАЯ ПРОВЕРКА
-- =====================================================
SELECT 
    id,
    tg_chat_id,
    title,
    bot_status,
    migrated_from
FROM telegram_groups
WHERE title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY title;

