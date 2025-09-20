-- Добавление нового статуса 'inactive' в поле bot_status таблицы telegram_groups
ALTER TABLE telegram_groups ALTER COLUMN bot_status TYPE text USING bot_status::text;
ALTER TABLE telegram_groups ADD CONSTRAINT telegram_groups_bot_status_check CHECK (bot_status IN ('connected', 'pending', 'inactive'));

-- Проверка на наличие дубликатов по названию и удаление неактивных дубликатов
DO $$
DECLARE
    group_record RECORD;
    duplicate_record RECORD;
BEGIN
    -- Находим все группы с одинаковыми названиями
    FOR group_record IN
        SELECT title, array_agg(id ORDER BY CASE WHEN bot_status = 'connected' THEN 1 
                                              WHEN bot_status = 'pending' THEN 2
                                              ELSE 3 END, id) as ids
        FROM telegram_groups
        WHERE title IS NOT NULL
        GROUP BY title
        HAVING COUNT(*) > 1
    LOOP
        -- Оставляем только первую запись (с лучшим статусом), остальные удаляем
        FOR i IN 2..array_length(group_record.ids, 1) LOOP
            DELETE FROM telegram_groups WHERE id = group_record.ids[i];
            RAISE NOTICE 'Удален дубликат группы % с ID %', group_record.title, group_record.ids[i];
        END LOOP;
    END LOOP;
END $$;
