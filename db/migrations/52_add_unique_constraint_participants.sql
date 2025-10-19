-- Добавление уникального constraint для participants (org_id, tg_user_id)
-- Это позволит использовать UPSERT без ошибок

-- Сначала проверяем, нет ли дубликатов
DO $$ 
BEGIN
  RAISE NOTICE '=== ПРОВЕРКА ДУБЛИКАТОВ ПЕРЕД СОЗДАНИЕМ CONSTRAINT ===';
  
  -- Ищем дубликаты
  RAISE NOTICE 'Поиск дубликатов (org_id, tg_user_id)...';
END $$;

-- Показываем дубликаты, если они есть
SELECT 
  org_id,
  tg_user_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id) as participant_ids
FROM participants
WHERE tg_user_id IS NOT NULL
  AND merged_into IS NULL
GROUP BY org_id, tg_user_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Если дубликатов нет (таблица пустая), создаем constraint
DO $$ 
BEGIN
  -- Проверяем, существует ли уже constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_org_tg_user_unique'
  ) THEN
    RAISE NOTICE 'Создание уникального constraint...';
    
    -- Создаем уникальный индекс с условием (только для незамерженных)
    CREATE UNIQUE INDEX participants_org_tg_user_unique 
    ON participants (org_id, tg_user_id) 
    WHERE merged_into IS NULL AND tg_user_id IS NOT NULL;
    
    RAISE NOTICE '✅ Уникальный индекс создан: participants_org_tg_user_unique';
    RAISE NOTICE '   Условие: merged_into IS NULL AND tg_user_id IS NOT NULL';
  ELSE
    RAISE NOTICE '⚠️  Constraint уже существует, пропускаем создание';
  END IF;
  
  RAISE NOTICE '=== МИГРАЦИЯ ЗАВЕРШЕНА ===';
END $$;

-- Проверка созданного индекса
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'participants'
  AND indexname = 'participants_org_tg_user_unique';

