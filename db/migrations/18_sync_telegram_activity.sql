-- Миграция для синхронизации telegram_activity_events с activity_events
-- Исправление аналитики телеграм-групп

-- 1. Создаем функцию для копирования данных из telegram_activity_events в activity_events
CREATE OR REPLACE FUNCTION sync_telegram_activity_to_activity_events()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
  v_participant_id uuid;
BEGIN
  -- Получаем org_id из telegram_groups по tg_chat_id
  SELECT org_id INTO v_org_id
  FROM telegram_groups
  WHERE tg_chat_id = NEW.tg_chat_id
  LIMIT 1;
  
  -- Если группа не найдена, пропускаем
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Получаем participant_id из participants по tg_user_id и org_id
  SELECT id INTO v_participant_id
  FROM participants
  WHERE tg_user_id = NEW.tg_user_id
    AND org_id = v_org_id
  LIMIT 1;
  
  -- Вставляем событие в activity_events
  INSERT INTO activity_events (
    org_id,
    event_type,
    participant_id,
    tg_user_id,
    tg_chat_id,
    message_id,
    message_thread_id,
    reply_to_message_id,
    has_media,
    chars_count,
    links_count,
    mentions_count,
    created_at,
    meta
  ) VALUES (
    v_org_id,
    NEW.event_type,
    v_participant_id,
    NEW.tg_user_id,
    NEW.tg_chat_id,
    NEW.message_id,
    NEW.message_thread_id,
    NEW.reply_to_message_id,
    COALESCE((NEW.meta->>'has_media')::boolean, FALSE),
    COALESCE((NEW.meta->>'message_length')::integer, 0),
    COALESCE((NEW.meta->>'links_count')::integer, 0),
    COALESCE((NEW.meta->>'mentions_count')::integer, 0),
    NEW.created_at,
    NEW.meta
  )
  ON CONFLICT DO NOTHING; -- Избегаем дублирования
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Создаем триггер для автоматической синхронизации новых событий
DROP TRIGGER IF EXISTS trigger_sync_telegram_activity ON telegram_activity_events;

CREATE TRIGGER trigger_sync_telegram_activity
AFTER INSERT ON telegram_activity_events
FOR EACH ROW
EXECUTE FUNCTION sync_telegram_activity_to_activity_events();

-- 3. Синхронизируем существующие данные из telegram_activity_events в activity_events
-- Очищаем activity_events перед синхронизацией (опционально, раскомментируйте если нужно)
-- TRUNCATE TABLE activity_events;

-- Копируем все существующие события из telegram_activity_events
INSERT INTO activity_events (
  org_id,
  event_type,
  participant_id,
  tg_user_id,
  tg_chat_id,
  message_id,
  message_thread_id,
  reply_to_message_id,
  has_media,
  chars_count,
  links_count,
  mentions_count,
  created_at,
  meta
)
SELECT 
  tg.org_id,
  tae.event_type,
  p.id AS participant_id,
  tae.tg_user_id,
  tae.tg_chat_id,
  tae.message_id,
  tae.message_thread_id,
  tae.reply_to_message_id,
  COALESCE((tae.meta->>'has_media')::boolean, FALSE) AS has_media,
  COALESCE((tae.meta->>'message_length')::integer, 0) AS chars_count,
  COALESCE((tae.meta->>'links_count')::integer, 0) AS links_count,
  COALESCE((tae.meta->>'mentions_count')::integer, 0) AS mentions_count,
  tae.created_at,
  tae.meta
FROM telegram_activity_events tae
INNER JOIN telegram_groups tg ON tg.tg_chat_id = tae.tg_chat_id
LEFT JOIN participants p ON p.tg_user_id = tae.tg_user_id AND p.org_id = tg.org_id
WHERE NOT EXISTS (
  -- Проверяем, что такое событие еще не существует в activity_events
  SELECT 1 FROM activity_events ae
  WHERE ae.tg_chat_id = tae.tg_chat_id
    AND ae.tg_user_id = tae.tg_user_id
    AND ae.message_id = tae.message_id
    AND ae.created_at = tae.created_at
    AND ae.event_type = tae.event_type
)
ON CONFLICT DO NOTHING;

-- 4. Создаем индексы для оптимизации запросов (если еще не существуют)
CREATE INDEX IF NOT EXISTS idx_telegram_activity_events_chat_created 
  ON telegram_activity_events(tg_chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_activity_events_user 
  ON telegram_activity_events(tg_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_activity_events_event_type 
  ON telegram_activity_events(event_type, tg_chat_id, created_at DESC);

-- Выводим статистику синхронизации
DO $$
DECLARE
  v_telegram_count integer;
  v_activity_count integer;
BEGIN
  SELECT COUNT(*) INTO v_telegram_count FROM telegram_activity_events;
  SELECT COUNT(*) INTO v_activity_count FROM activity_events;
  
  RAISE NOTICE 'Синхронизация завершена:';
  RAISE NOTICE '  - Событий в telegram_activity_events: %', v_telegram_count;
  RAISE NOTICE '  - Событий в activity_events: %', v_activity_count;
END $$;

