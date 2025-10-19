-- Исправление unique constraint для participants
-- Проблема: PostgREST не поддерживает partial indexes для ON CONFLICT
-- Решение: Создать обычный UNIQUE CONSTRAINT без WHERE условия

DO $$ 
BEGIN
  RAISE NOTICE '=== ИСПРАВЛЕНИЕ UNIQUE CONSTRAINT ===';
  
  -- Удаляем старый partial index
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'participants_org_tg_user_unique'
  ) THEN
    RAISE NOTICE 'Удаление старого partial index...';
    DROP INDEX IF EXISTS participants_org_tg_user_unique;
    RAISE NOTICE '✅ Старый индекс удалён';
  END IF;
  
  -- Создаем обычный UNIQUE CONSTRAINT
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'participants_org_tg_user_key'
  ) THEN
    RAISE NOTICE 'Создание UNIQUE CONSTRAINT без WHERE...';
    
    ALTER TABLE participants 
    ADD CONSTRAINT participants_org_tg_user_key 
    UNIQUE (org_id, tg_user_id);
    
    RAISE NOTICE '✅ UNIQUE CONSTRAINT создан: participants_org_tg_user_key';
  ELSE
    RAISE NOTICE '⚠️  CONSTRAINT уже существует';
  END IF;
  
  RAISE NOTICE '=== МИГРАЦИЯ ЗАВЕРШЕНА ===';
  RAISE NOTICE 'Теперь UPSERT должен работать без ошибок!';
END $$;

-- Проверка
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'participants'::regclass
  AND conname = 'participants_org_tg_user_key';

