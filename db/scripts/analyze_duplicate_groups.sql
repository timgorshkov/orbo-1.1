-- =====================================================
-- СКРИПТ АНАЛИЗА ДУБЛИРУЮЩИХСЯ ГРУПП
-- ВАЖНО: Запускайте каждый запрос ОТДЕЛЬНО в Supabase SQL Editor!
-- =====================================================

-- =====================================================
-- ЗАПРОС 1: Найти ВСЕ дубликаты по tg_chat_id
-- =====================================================
SELECT 
    tg_chat_id,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY id) as ids,
    array_agg(title ORDER BY id) as titles,
    array_agg(bot_status ORDER BY id) as statuses
FROM telegram_groups
GROUP BY tg_chat_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;


-- =====================================================
-- ЗАПРОС 2: Показать ВСЕ записи для проблемных групп
-- =====================================================
SELECT 
    id,
    tg_chat_id,
    title,
    bot_status,
    migrated_to,
    migrated_from,
    last_sync_at
FROM telegram_groups
WHERE title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY title, tg_chat_id;


-- =====================================================
-- ЗАПРОС 3: Связанные данные для проблемных групп
-- =====================================================
SELECT 
    tg.id,
    tg.tg_chat_id,
    tg.title,
    tg.bot_status,
    (SELECT COUNT(*) FROM org_telegram_groups otg WHERE otg.tg_chat_id::text = tg.tg_chat_id::text) as org_bindings,
    (SELECT COUNT(*) FROM telegram_group_admins tga WHERE tga.tg_chat_id::text = tg.tg_chat_id::text) as admin_records,
    (SELECT COUNT(*) FROM participant_groups pg WHERE pg.tg_group_id::text = tg.tg_chat_id::text) as participant_links,
    (SELECT COUNT(*) FROM activity_events ae WHERE ae.tg_chat_id::text = tg.tg_chat_id::text) as activity_events
FROM telegram_groups tg
WHERE tg.title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY tg.title, tg.tg_chat_id;


-- =====================================================
-- ЗАПРОС 4: Потенциальные миграции (разные chat_id, одинаковое название)
-- Группы с -100 = supergroups (новые), без -100 = обычные (старые)
-- =====================================================
SELECT 
    g1.title,
    g1.tg_chat_id as old_chat_id,
    g1.bot_status as old_status,
    g1.id as old_id,
    g2.tg_chat_id as new_chat_id,
    g2.bot_status as new_status,
    g2.id as new_id,
    'LIKELY_MIGRATION' as hint
FROM telegram_groups g1
JOIN telegram_groups g2 ON g1.title = g2.title AND g1.tg_chat_id != g2.tg_chat_id
WHERE 
    g1.tg_chat_id NOT LIKE '-100%'  -- старая группа (не supergroup)
    AND g2.tg_chat_id LIKE '-100%'   -- новая группа (supergroup)
    AND g1.title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY g1.title;


-- =====================================================
-- ЗАПРОС 5: Существующие миграции в таблице
-- =====================================================
SELECT * FROM telegram_chat_migrations ORDER BY migrated_at DESC LIMIT 20;


-- =====================================================
-- ЗАПРОС 6: Общая статистика
-- =====================================================
SELECT 
    (SELECT COUNT(*) FROM telegram_groups) as total_groups,
    (SELECT COUNT(*) FROM telegram_groups WHERE tg_chat_id IN (
        SELECT tg_chat_id FROM telegram_groups GROUP BY tg_chat_id HAVING COUNT(*) > 1
    )) as duplicate_records,
    (SELECT COUNT(*) FROM telegram_groups WHERE migrated_to IS NOT NULL) as migrated_groups,
    (SELECT COUNT(*) FROM telegram_chat_migrations) as migration_records;
