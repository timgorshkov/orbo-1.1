-- Создаем SQL функцию для получения участников с количеством групп

-- Функция для получения участников с количеством групп
CREATE OR REPLACE FUNCTION get_participants_with_group_count(org_id_param UUID)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  tg_user_id BIGINT,
  username TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE,
  activity_score INTEGER,
  risk_score INTEGER,
  group_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.*,
    COALESCE(
      (SELECT COUNT(*) 
       FROM participant_groups pg 
       WHERE pg.participant_id = p.id AND pg.is_active = TRUE),
      0
    ) AS group_count
  FROM 
    participants p
  WHERE 
    p.org_id = org_id_param
  ORDER BY 
    p.last_activity_at DESC NULLS LAST,
    p.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Функция для создания функции get_participants_with_group_count, если она не существует
-- Это метафункция, которую можно вызвать из кода для создания основной функции
CREATE OR REPLACE FUNCTION create_get_participants_function(org_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  function_exists BOOLEAN;
BEGIN
  -- Проверяем, существует ли функция
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_participants_with_group_count'
  ) INTO function_exists;
  
  -- Если функция не существует, создаем ее
  IF NOT function_exists THEN
    EXECUTE $FUNC$
    CREATE OR REPLACE FUNCTION get_participants_with_group_count(org_id_param UUID)
    RETURNS TABLE (
      id UUID,
      org_id UUID,
      tg_user_id BIGINT,
      username TEXT,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMP WITH TIME ZONE,
      last_activity_at TIMESTAMP WITH TIME ZONE,
      activity_score INTEGER,
      risk_score INTEGER,
      group_count BIGINT
    ) AS $INNER$
    BEGIN
      RETURN QUERY
      SELECT 
        p.*,
        COALESCE(
          (SELECT COUNT(*) 
           FROM participant_groups pg 
           WHERE pg.participant_id = p.id AND pg.is_active = TRUE),
          0
        ) AS group_count
      FROM 
        participants p
      WHERE 
        p.org_id = org_id_param
      ORDER BY 
        p.last_activity_at DESC NULLS LAST,
        p.created_at DESC
      LIMIT 100;
    END;
    $INNER$ LANGUAGE plpgsql;
    $FUNC$;
    
    RETURN 'Function created successfully';
  ELSE
    RETURN 'Function already exists';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Функция для обновления количества участников в группе
CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER AS $$
DECLARE
  v_tg_group_id BIGINT;
BEGIN
  -- Получаем tg_group_id в зависимости от операции (NEW для INSERT/UPDATE, OLD для DELETE)
  v_tg_group_id := COALESCE(NEW.tg_group_id, OLD.tg_group_id);
  
  -- Обновляем счетчик участников в группе
  UPDATE telegram_groups
  SET member_count = (
    SELECT COUNT(*)
    FROM participant_groups pg
    WHERE pg.tg_group_id = v_tg_group_id
    AND pg.is_active = TRUE
  )
  WHERE tg_chat_id = v_tg_group_id;
  
  -- Возвращаем NEW для INSERT/UPDATE, OLD для DELETE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Проверяем и добавляем колонку member_count в таблицу telegram_groups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'telegram_groups' AND column_name = 'member_count'
  ) THEN
    ALTER TABLE telegram_groups ADD COLUMN member_count INTEGER DEFAULT 0;
    RAISE NOTICE 'Added member_count column to telegram_groups';
  END IF;
END
$$;

-- Создаем триггер для обновления количества участников при изменении participant_groups
DROP TRIGGER IF EXISTS update_member_count_trigger ON participant_groups;
CREATE TRIGGER update_member_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON participant_groups
FOR EACH ROW
EXECUTE FUNCTION update_group_member_count();

-- Обновляем количество участников для всех групп
UPDATE telegram_groups tg
SET member_count = (
  SELECT COUNT(*)
  FROM participant_groups pg
  WHERE pg.tg_group_id = tg.tg_chat_id::bigint
  AND pg.is_active = TRUE
);
