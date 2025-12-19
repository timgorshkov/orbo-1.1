-- =====================================================
-- СКРИПТ ОБРАБОТКИ НЕОБРАБОТАННЫХ МИГРАЦИЙ
-- =====================================================
-- 
-- Этот скрипт обрабатывает случаи, когда группа была конвертирована
-- в супергруппу, но миграция не была обработана автоматически.
-- 
-- Признаки такой ситуации:
-- - Две группы с ОДИНАКОВЫМ названием
-- - РАЗНЫЕ tg_chat_id
-- - Новый chat_id начинается с -100 (supergroup)
-- - Старый chat_id не начинается с -100 (обычная группа)
-- =====================================================

BEGIN;

-- Создаем временную таблицу для логирования
CREATE TEMP TABLE migration_fix_log (
    action TEXT,
    old_chat_id TEXT,
    new_chat_id TEXT,
    title TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Анализируем потенциальные миграции
WITH potential_migrations AS (
    SELECT 
        g1.id as old_id,
        g1.tg_chat_id as old_chat_id,
        g1.title,
        g1.bot_status as old_status,
        g2.id as new_id,
        g2.tg_chat_id as new_chat_id,
        g2.bot_status as new_status
    FROM telegram_groups g1
    JOIN telegram_groups g2 ON g1.title = g2.title 
        AND g1.tg_chat_id != g2.tg_chat_id
    WHERE 
        -- Новый chat_id начинается с -100 (supergroup)
        g2.tg_chat_id LIKE '-100%'
        -- Старый chat_id НЕ начинается с -100 (обычная группа)
        AND g1.tg_chat_id NOT LIKE '-100%'
        -- Ещё не помечена как мигрированная
        AND g1.migrated_to IS NULL
        -- Фильтруем по известным проблемным группам
        AND g1.title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
)
SELECT 
    *,
    -- Проверяем, есть ли уже запись в migrations
    EXISTS (
        SELECT 1 FROM telegram_chat_migrations 
        WHERE old_chat_id::text = pm.old_chat_id 
        AND new_chat_id::text = pm.new_chat_id
    ) as migration_exists
FROM potential_migrations pm;

-- Выполняем миграцию для каждой потенциальной пары
DO $$
DECLARE
    v_migration RECORD;
    v_result JSONB;
BEGIN
    RAISE NOTICE '=== Обработка необработанных миграций ===';
    
    FOR v_migration IN 
        SELECT 
            g1.id as old_id,
            g1.tg_chat_id as old_chat_id,
            g1.title,
            g1.bot_status as old_status,
            g2.id as new_id,
            g2.tg_chat_id as new_chat_id,
            g2.bot_status as new_status
        FROM telegram_groups g1
        JOIN telegram_groups g2 ON g1.title = g2.title 
            AND g1.tg_chat_id != g2.tg_chat_id
        WHERE 
            g2.tg_chat_id LIKE '-100%'
            AND g1.tg_chat_id NOT LIKE '-100%'
            AND g1.migrated_to IS NULL
            AND g1.title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
    LOOP
        RAISE NOTICE 'Обрабатываем миграцию: % -> % (группа: %)', 
            v_migration.old_chat_id, v_migration.new_chat_id, v_migration.title;
        
        -- Вызываем функцию миграции
        SELECT migrate_telegram_chat_id(
            v_migration.old_chat_id::BIGINT, 
            v_migration.new_chat_id::BIGINT
        ) INTO v_result;
        
        -- Логируем результат
        INSERT INTO migration_fix_log (action, old_chat_id, new_chat_id, title, details)
        VALUES (
            'MIGRATION_EXECUTED',
            v_migration.old_chat_id,
            v_migration.new_chat_id,
            v_migration.title,
            v_result
        );
        
        RAISE NOTICE '  Результат: %', v_result;
    END LOOP;
    
    RAISE NOTICE '=== Обработка завершена ===';
END;
$$;

-- Показать лог действий
SELECT * FROM migration_fix_log ORDER BY created_at;

-- Проверить, что миграции записаны
SELECT * FROM telegram_chat_migrations ORDER BY migrated_at DESC LIMIT 10;

-- Проверить, что старые группы помечены как migrated
SELECT id, tg_chat_id, title, bot_status, migrated_to, migrated_from
FROM telegram_groups
WHERE title IN ('тест 6', 'тест орбо', 'inSales. Финансы и показатели', 'Orbo. Рабочий чат', '12313123')
ORDER BY title, tg_chat_id;

-- Если всё хорошо - COMMIT, если нет - ROLLBACK
COMMIT;

