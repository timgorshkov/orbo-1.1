-- ============================================================================
-- ОПЦИОНАЛЬНАЯ ОЧИСТКА ДУБЛЕЙ PARTICIPANT
-- ============================================================================
-- ВНИМАНИЕ: Этот скрипт НЕ ОБЯЗАТЕЛЕН! Запускай только если хочешь очистить дубли.
-- Миграция 088 уже учитывает дубли и работает корректно.
--
-- Что делает:
-- 1. Находит дубли: несколько participant_id для одного tg_user_id в одной org
-- 2. Оставляет самый старый participant_id
-- 3. Переносит все связи (participant_groups) на него
-- 4. Удаляет дубликаты
--
-- Рекомендация: Запусти сначала диагностику, потом решай нужна ли очистка
-- ============================================================================

-- STEP 1: Диагностика - покажи дубли
SELECT 
  p.org_id,
  p.tg_user_id,
  p.username,
  COUNT(DISTINCT p.id) as participant_count,
  array_agg(p.id ORDER BY p.created_at) as participant_ids,
  array_agg(p.created_at ORDER BY p.created_at) as created_dates
FROM participants p
WHERE p.tg_user_id IS NOT NULL
  AND p.org_id IS NOT NULL
GROUP BY p.org_id, p.tg_user_id, p.username
HAVING COUNT(DISTINCT p.id) > 1
ORDER BY COUNT(DISTINCT p.id) DESC;

-- Если дубли есть, продолжай

-- STEP 2: Создай временную таблицу с маппингом (какой ID оставить, какие удалить)
CREATE TEMP TABLE IF NOT EXISTS participant_merge_map AS
WITH duplicates AS (
  SELECT 
    p.org_id,
    p.tg_user_id,
    p.id as participant_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.org_id, p.tg_user_id 
      ORDER BY p.created_at ASC  -- Оставляем самый старый
    ) as rn
  FROM participants p
  WHERE p.tg_user_id IS NOT NULL
    AND p.org_id IS NOT NULL
)
SELECT 
  d.participant_id as old_id,
  (
    SELECT participant_id 
    FROM duplicates d2 
    WHERE d2.org_id = d.org_id 
      AND d2.tg_user_id = d.tg_user_id 
      AND d2.rn = 1
  ) as keep_id
FROM duplicates d
WHERE d.rn > 1;  -- Только дубли (не первые записи)

-- STEP 3: Проверь маппинг
SELECT 
  COUNT(*) as duplicates_to_remove,
  COUNT(DISTINCT old_id) as unique_old_ids,
  COUNT(DISTINCT keep_id) as unique_keep_ids
FROM participant_merge_map;

SELECT * FROM participant_merge_map LIMIT 20;

-- STEP 4: Перенеси participant_groups на правильный participant_id
UPDATE participant_groups pg
SET participant_id = pmm.keep_id
FROM participant_merge_map pmm
WHERE pg.participant_id = pmm.old_id
  -- Только если такой связки ещё нет
  AND NOT EXISTS (
    SELECT 1 FROM participant_groups pg2
    WHERE pg2.participant_id = pmm.keep_id
      AND pg2.tg_group_id = pg.tg_group_id
  );

-- STEP 5: Удали duplicate participant_groups (если после UPDATE остались дубли связей)
DELETE FROM participant_groups pg
WHERE pg.participant_id IN (SELECT old_id FROM participant_merge_map)
  -- Только если уже есть такая же связь с keep_id
  AND EXISTS (
    SELECT 1 FROM participant_groups pg2
    WHERE pg2.participant_id IN (SELECT keep_id FROM participant_merge_map WHERE old_id = pg.participant_id)
      AND pg2.tg_group_id = pg.tg_group_id
  );

-- STEP 6: Удали дублирующиеся participant записи
DELETE FROM participants p
WHERE p.id IN (SELECT old_id FROM participant_merge_map);

-- STEP 7: Проверка результата
SELECT 
  p.org_id,
  p.tg_user_id,
  p.username,
  COUNT(DISTINCT p.id) as participant_count
FROM participants p
WHERE p.tg_user_id IS NOT NULL
  AND p.org_id IS NOT NULL
GROUP BY p.org_id, p.tg_user_id, p.username
HAVING COUNT(DISTINCT p.id) > 1;

-- Должно быть 0 строк

-- STEP 8: Очистка временной таблицы
DROP TABLE IF EXISTS participant_merge_map;

-- ============================================================================
-- ГОТОВО! Теперь у каждого tg_user_id в каждой org только 1 participant_id
-- ============================================================================

