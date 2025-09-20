-- Проверяем структуру таблицы participants
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'participants'
ORDER BY ordinal_position;

-- Проверяем количество записей
SELECT COUNT(*) FROM participants;

-- Проверяем существующие записи
SELECT * FROM participants LIMIT 10;

-- Проверяем структуру таблицы participant_groups
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'participant_groups'
ORDER BY ordinal_position;

-- Проверяем количество записей в participant_groups
SELECT COUNT(*) FROM participant_groups;

-- Проверяем существующие записи в participant_groups
SELECT * FROM participant_groups LIMIT 10;
