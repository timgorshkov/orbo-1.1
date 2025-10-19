-- Проверка структуры таблицы activity_events
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_events'
ORDER BY ordinal_position;

