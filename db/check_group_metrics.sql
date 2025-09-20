-- Проверяем существование таблицы group_metrics
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public'
   AND table_name = 'group_metrics'
);

-- Проверяем структуру таблицы group_metrics
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'group_metrics'
ORDER BY ordinal_position;

-- Проверяем наличие данных в таблице
SELECT COUNT(*) FROM group_metrics;

-- Проверяем структуру таблицы activity_events
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_events'
ORDER BY ordinal_position;

-- Проверяем наличие данных в activity_events
SELECT COUNT(*) FROM activity_events;
