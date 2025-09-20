-- Обновление системы управления участниками

-- 1. Проверяем и обновляем структуру таблицы participants
DO $$
BEGIN
  -- Проверяем существование таблицы participants
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'participants'
  ) THEN
    -- Создаем таблицу participants, если она не существует
    CREATE TABLE participants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      org_id UUID NOT NULL REFERENCES organizations(id),
      tg_user_id BIGINT,
      username TEXT,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_activity_at TIMESTAMP WITH TIME ZONE,
      activity_score INTEGER DEFAULT 0,
      risk_score INTEGER DEFAULT 0
    );
    
    CREATE INDEX idx_participants_org_id ON participants(org_id);
    CREATE INDEX idx_participants_tg_user_id ON participants(tg_user_id);
    
    RAISE NOTICE 'Created participants table';
  ELSE
    -- Проверяем и добавляем недостающие колонки
    
    -- Проверяем наличие колонки last_activity_at
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'participants' AND column_name = 'last_activity_at'
    ) THEN
      ALTER TABLE participants ADD COLUMN last_activity_at TIMESTAMP WITH TIME ZONE;
      RAISE NOTICE 'Added last_activity_at column to participants';
    END IF;
    
    -- Проверяем наличие колонки activity_score
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'participants' AND column_name = 'activity_score'
    ) THEN
      ALTER TABLE participants ADD COLUMN activity_score INTEGER DEFAULT 0;
      RAISE NOTICE 'Added activity_score column to participants';
    END IF;
    
    -- Проверяем наличие колонки risk_score
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'participants' AND column_name = 'risk_score'
    ) THEN
      ALTER TABLE participants ADD COLUMN risk_score INTEGER DEFAULT 0;
      RAISE NOTICE 'Added risk_score column to participants';
    END IF;
  END IF;
  
  -- Проверяем существование таблицы participant_groups
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'participant_groups'
  ) THEN
    -- Создаем таблицу participant_groups, если она не существует
    CREATE TABLE participant_groups (
      id SERIAL PRIMARY KEY,
      participant_id UUID NOT NULL REFERENCES participants(id),
      tg_group_id BIGINT NOT NULL,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      left_at TIMESTAMP WITH TIME ZONE,
      is_active BOOLEAN DEFAULT TRUE,
      UNIQUE(participant_id, tg_group_id)
    );
    
    CREATE INDEX idx_participant_groups_participant_id ON participant_groups(participant_id);
    CREATE INDEX idx_participant_groups_tg_group_id ON participant_groups(tg_group_id);
    
    RAISE NOTICE 'Created participant_groups table';
  ELSE
    -- Проверяем и добавляем недостающие колонки
    
    -- Проверяем наличие колонки left_at
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'participant_groups' AND column_name = 'left_at'
    ) THEN
      ALTER TABLE participant_groups ADD COLUMN left_at TIMESTAMP WITH TIME ZONE;
      RAISE NOTICE 'Added left_at column to participant_groups';
    END IF;
    
    -- Проверяем наличие колонки is_active
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'participant_groups' AND column_name = 'is_active'
    ) THEN
      ALTER TABLE participant_groups ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
      RAISE NOTICE 'Added is_active column to participant_groups';
    END IF;
  END IF;
END
$$;

-- 2. Удаляем тестовые данные, которые не соответствуют реальным группам
DELETE FROM participant_groups
WHERE tg_group_id NOT IN (
  SELECT tg_chat_id::bigint FROM telegram_groups
);

-- 3. Обновляем таблицу participants на основе activity_events
-- Добавляем участников из activity_events, которых еще нет в таблице participants
INSERT INTO participants (org_id, tg_user_id, username, full_name, created_at, last_activity_at)
SELECT DISTINCT 
  ae.org_id,
  ae.tg_user_id,
  (ae.meta->'user'->>'username')::text as username,
  (ae.meta->'user'->>'name')::text as full_name,
  MIN(ae.created_at) as created_at,
  MAX(ae.created_at) as last_activity_at
FROM 
  activity_events ae
WHERE 
  ae.tg_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM participants p 
    WHERE p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  )
GROUP BY 
  ae.org_id, ae.tg_user_id, (ae.meta->'user'->>'username'), (ae.meta->'user'->>'name');

-- 4. Обновляем таблицу participant_groups на основе activity_events
-- Добавляем связи между участниками и группами на основе событий join
WITH join_events AS (
  SELECT 
    p.id as participant_id,
    ae.tg_chat_id as tg_group_id,
    MIN(ae.created_at) as joined_at
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  WHERE 
    ae.event_type = 'join'
  GROUP BY 
    p.id, ae.tg_chat_id
)
INSERT INTO participant_groups (participant_id, tg_group_id, joined_at)
SELECT 
  je.participant_id,
  je.tg_group_id,
  je.joined_at
FROM 
  join_events je
WHERE 
  NOT EXISTS (
    SELECT 1 FROM participant_groups pg 
    WHERE pg.participant_id = je.participant_id AND pg.tg_group_id = je.tg_group_id
  );

-- 5. Обновляем статус участников в группах на основе событий leave
WITH leave_events AS (
  SELECT 
    p.id as participant_id,
    ae.tg_chat_id as tg_group_id,
    MAX(ae.created_at) as left_at
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  WHERE 
    ae.event_type = 'leave'
  GROUP BY 
    p.id, ae.tg_chat_id
)
UPDATE participant_groups pg
SET 
  left_at = le.left_at,
  is_active = FALSE
FROM 
  leave_events le
WHERE 
  pg.participant_id = le.participant_id 
  AND pg.tg_group_id = le.tg_group_id
  AND (pg.left_at IS NULL OR pg.left_at < le.left_at);

-- 6. Обновляем время последней активности участников
WITH last_activity AS (
  SELECT 
    p.id as participant_id,
    MAX(ae.created_at) as last_activity_at
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  GROUP BY 
    p.id
)
UPDATE participants p
SET 
  last_activity_at = la.last_activity_at
FROM 
  last_activity la
WHERE 
  p.id = la.participant_id
  AND (p.last_activity_at IS NULL OR p.last_activity_at < la.last_activity_at);

-- 7. Обновляем счетчик активности участников
WITH activity_counts AS (
  SELECT 
    p.id as participant_id,
    COUNT(*) as activity_count
  FROM 
    activity_events ae
    JOIN participants p ON p.org_id = ae.org_id AND p.tg_user_id = ae.tg_user_id
  WHERE 
    ae.event_type = 'message'
    AND ae.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 
    p.id
)
UPDATE participants p
SET 
  activity_score = ac.activity_count
FROM 
  activity_counts ac
WHERE 
  p.id = ac.participant_id;

-- 8. Создаем RLS политики для таблицы participants
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- Создаем политику для чтения записей participants
CREATE POLICY participants_select_policy
  ON participants
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id = participants.org_id
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Создаем политику для вставки записей participants
CREATE POLICY participants_insert_policy
  ON participants
  FOR INSERT
  WITH CHECK (true);  -- Разрешаем вставку всем (включая сервисные роли)

-- 9. Создаем RLS политики для таблицы participant_groups
ALTER TABLE participant_groups ENABLE ROW LEVEL SECURITY;

-- Создаем политику для чтения записей participant_groups
CREATE POLICY participant_groups_select_policy
  ON participant_groups
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM memberships WHERE org_id IN (
        SELECT org_id FROM participants WHERE id = participant_groups.participant_id
      )
    )
    OR auth.uid() IN (
      SELECT id FROM auth.users WHERE auth.users.is_super_admin = true
    )
  );

-- Создаем политику для вставки записей participant_groups
CREATE POLICY participant_groups_insert_policy
  ON participant_groups
  FOR INSERT
  WITH CHECK (true);  -- Разрешаем вставку всем (включая сервисные роли)
