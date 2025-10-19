-- Проверка constraints и индексов таблицы participants

-- 1. Все constraints
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'participants'::regclass
ORDER BY contype, conname;

-- 2. Все индексы
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'participants'
ORDER BY indexname;

-- 3. Структура таблицы
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'participants'
ORDER BY ordinal_position;

