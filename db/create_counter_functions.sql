-- Функции для инкремента и декремента счетчиков

-- Функция для инкремента счетчика
CREATE OR REPLACE FUNCTION increment_counter(row_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Получаем текущее значение
  SELECT member_count INTO current_count
  FROM telegram_groups
  WHERE tg_chat_id = row_id;
  
  -- Если значение NULL, устанавливаем в 1
  IF current_count IS NULL THEN
    RETURN 1;
  ELSE
    RETURN current_count + 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Функция для декремента счетчика
CREATE OR REPLACE FUNCTION decrement_counter(row_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  -- Получаем текущее значение
  SELECT member_count INTO current_count
  FROM telegram_groups
  WHERE tg_chat_id = row_id;
  
  -- Если значение NULL или 0, оставляем 0
  IF current_count IS NULL OR current_count <= 0 THEN
    RETURN 0;
  ELSE
    RETURN current_count - 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Функция для пересчета количества участников в группе
CREATE OR REPLACE FUNCTION recalculate_member_count(group_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  member_count INTEGER;
BEGIN
  -- Считаем активных участников
  SELECT COUNT(*) INTO member_count
  FROM participant_groups
  WHERE tg_group_id = group_id
  AND is_active = TRUE;
  
  -- Обновляем счетчик в группе
  UPDATE telegram_groups
  SET member_count = member_count
  WHERE tg_chat_id = group_id;
  
  RETURN member_count;
END;
$$ LANGUAGE plpgsql;
