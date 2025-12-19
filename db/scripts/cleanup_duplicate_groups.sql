-- =====================================================
-- СКРИПТ БЕЗОПАСНОЙ ОЧИСТКИ ДУБЛИРУЮЩИХСЯ ГРУПП
-- =====================================================
-- 
-- ВАЖНО: Запустите СНАЧАЛА analyze_duplicate_groups.sql
-- чтобы понять, какие дубли есть и что будет удалено!
--
-- Этот скрипт:
-- 1. Находит дубликаты по tg_chat_id
-- 2. Выбирает "лучшую" запись для сохранения (connected > pending > inactive)
-- 3. НЕ удаляет связанные данные, т.к. они привязаны к tg_chat_id, а не к id
-- 4. Удаляет только лишние записи в telegram_groups
-- =====================================================

BEGIN;

-- Создаем временную таблицу для логирования действий
CREATE TEMP TABLE cleanup_log (
    action TEXT,
    tg_chat_id TEXT,
    kept_id BIGINT,
    removed_ids BIGINT[],
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Функция для определения приоритета статуса (меньше = лучше)
CREATE OR REPLACE FUNCTION status_priority(status TEXT) RETURNS INT AS $$
BEGIN
    RETURN CASE status
        WHEN 'connected' THEN 1
        WHEN 'active' THEN 2
        WHEN 'pending' THEN 3
        WHEN 'migration_needed' THEN 4
        WHEN 'migrated' THEN 5
        WHEN 'inactive' THEN 6
        ELSE 7
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Основной блок очистки
DO $$
DECLARE
    v_dup RECORD;
    v_keep_id BIGINT;
    v_remove_ids BIGINT[];
    v_keep_record RECORD;
BEGIN
    RAISE NOTICE '=== Начало очистки дублирующихся групп ===';
    
    -- Находим все дубликаты
    FOR v_dup IN 
        SELECT 
            tg_chat_id,
            array_agg(id ORDER BY 
                status_priority(bot_status),
                last_sync_at DESC NULLS LAST,
                id
            ) as ids
        FROM telegram_groups
        GROUP BY tg_chat_id
        HAVING COUNT(*) > 1
    LOOP
        -- Первый элемент - лучший (оставляем)
        v_keep_id := v_dup.ids[1];
        v_remove_ids := v_dup.ids[2:array_length(v_dup.ids, 1)];
        
        -- Получаем данные сохраняемой записи для лога
        SELECT * INTO v_keep_record FROM telegram_groups WHERE id = v_keep_id;
        
        RAISE NOTICE 'Группа %: сохраняем id=%, удаляем ids=%', 
            v_dup.tg_chat_id, v_keep_id, v_remove_ids;
        
        -- Логируем действие
        INSERT INTO cleanup_log (action, tg_chat_id, kept_id, removed_ids, details)
        VALUES (
            'MERGE_DUPLICATES',
            v_dup.tg_chat_id,
            v_keep_id,
            v_remove_ids,
            jsonb_build_object(
                'kept_title', v_keep_record.title,
                'kept_status', v_keep_record.bot_status,
                'kept_last_sync', v_keep_record.last_sync_at,
                'duplicates_count', array_length(v_remove_ids, 1)
            )
        );
        
        -- Удаляем дубликаты
        -- ВАЖНО: связанные таблицы (org_telegram_groups, telegram_group_admins, 
        -- participant_groups, activity_events) используют tg_chat_id, 
        -- а не id из telegram_groups, поэтому данные сохранятся!
        DELETE FROM telegram_groups WHERE id = ANY(v_remove_ids);
        
        RAISE NOTICE '  Удалено % дубликатов', array_length(v_remove_ids, 1);
    END LOOP;
    
    RAISE NOTICE '=== Очистка завершена ===';
END;
$$;

-- Показать лог действий
SELECT * FROM cleanup_log ORDER BY created_at;

-- Проверить результат - не должно быть дубликатов
SELECT 
    tg_chat_id,
    COUNT(*) as count
FROM telegram_groups
GROUP BY tg_chat_id
HAVING COUNT(*) > 1;

-- Если всё хорошо - закоммитить транзакцию
-- Если нет - откатить: ROLLBACK;
COMMIT;

-- Удаляем временную функцию
DROP FUNCTION IF EXISTS status_priority(TEXT);

