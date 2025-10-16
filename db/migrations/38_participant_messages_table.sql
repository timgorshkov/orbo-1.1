-- Создание таблицы для хранения текстов сообщений участников
-- Используется для анализа и формирования автоматических описаний профилей

CREATE TABLE IF NOT EXISTS participant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Связи
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  tg_user_id BIGINT NOT NULL,
  tg_chat_id BIGINT NOT NULL,
  
  -- Ссылка на событие в аналитике (опционально)
  activity_event_id INTEGER REFERENCES activity_events(id) ON DELETE SET NULL,
  
  -- Данные сообщения
  message_id BIGINT NOT NULL,
  message_text TEXT,
  message_thread_id BIGINT,
  reply_to_message_id BIGINT,
  
  -- Метаданные
  has_media BOOLEAN DEFAULT FALSE,
  media_type TEXT, -- 'photo', 'video', 'document', 'audio', 'voice', 'sticker'
  chars_count INTEGER,
  words_count INTEGER,
  
  -- Временные метки
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL, -- когда сообщение было отправлено
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- когда записано в БД
  
  -- Для будущего AI-анализа
  analyzed_at TIMESTAMP WITH TIME ZONE,
  analysis_data JSONB, -- результаты анализа: тональность, ключевые слова, темы и т.д.
  
  -- Полнотекстовый поиск
  message_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('russian', COALESCE(message_text, ''))
  ) STORED
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_participant_messages_org ON participant_messages(org_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_participant_messages_participant ON participant_messages(participant_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_participant_messages_chat ON participant_messages(tg_chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_participant_messages_user ON participant_messages(tg_user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_participant_messages_tsv ON participant_messages USING GIN(message_tsv); -- полнотекстовый поиск

-- Уникальность по message_id в рамках чата (предотвращение дублей)
CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_messages_unique ON participant_messages(tg_chat_id, message_id);

-- Комментарии
COMMENT ON TABLE participant_messages IS 'Хранение текстов сообщений участников для анализа и формирования профилей';
COMMENT ON COLUMN participant_messages.message_tsv IS 'Автоматически генерируемый вектор для полнотекстового поиска';
COMMENT ON COLUMN participant_messages.analysis_data IS 'JSON с результатами AI-анализа: sentiment, topics, keywords, etc';

-- RLS Политики
ALTER TABLE participant_messages ENABLE ROW LEVEL SECURITY;

-- Политика для чтения: участники организации могут читать сообщения своей организации
CREATE POLICY participant_messages_select_policy
  ON participant_messages
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_messages.org_id
    )
  );

-- Политика для вставки: разрешить всем (сервисная роль через webhook)
CREATE POLICY participant_messages_insert_policy
  ON participant_messages
  FOR INSERT
  WITH CHECK (true);

-- Политика для обновления: только владельцы и админы организации
CREATE POLICY participant_messages_update_policy
  ON participant_messages
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_messages.org_id 
        AND role IN ('owner', 'admin')
    )
  );

-- Политика для удаления: только владельцы организации
CREATE POLICY participant_messages_delete_policy
  ON participant_messages
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM memberships 
      WHERE org_id = participant_messages.org_id 
        AND role = 'owner'
    )
  );

-- Функция для автоматической очистки старых сообщений (retention policy: 90 дней)
CREATE OR REPLACE FUNCTION cleanup_old_participant_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM participant_messages
  WHERE sent_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % messages older than 90 days', deleted_count;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_participant_messages IS 'Удаляет сообщения старше 90 дней для экономии места';

-- Функция для удаления/анонимизации данных участника (GDPR compliance)
CREATE OR REPLACE FUNCTION delete_participant_data(p_participant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Удаляем все сообщения участника
  DELETE FROM participant_messages WHERE participant_id = p_participant_id;
  
  -- Анонимизируем события активности (не удаляем для сохранения статистики)
  UPDATE activity_events 
  SET participant_id = NULL, 
      tg_user_id = NULL,
      meta = CASE 
        WHEN meta IS NOT NULL 
        THEN jsonb_set(meta, '{user,anonymized}', 'true'::jsonb)
        ELSE '{"user": {"anonymized": true}}'::jsonb
      END
  WHERE participant_id = p_participant_id;
  
  RAISE NOTICE 'Participant data deleted/anonymized for ID: %', p_participant_id;
END;
$$;

COMMENT ON FUNCTION delete_participant_data IS 'Удаляет сообщения и анонимизирует события участника (GDPR Right to be Forgotten)';

-- Вспомогательная функция для получения статистики хранения
CREATE OR REPLACE FUNCTION get_participant_messages_stats()
RETURNS TABLE (
  total_messages BIGINT,
  total_participants BIGINT,
  total_size_mb NUMERIC,
  oldest_message TIMESTAMP WITH TIME ZONE,
  newest_message TIMESTAMP WITH TIME ZONE,
  avg_message_length NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_messages,
    COUNT(DISTINCT participant_id)::BIGINT as total_participants,
    ROUND((pg_total_relation_size('participant_messages')::NUMERIC / 1024 / 1024), 2) as total_size_mb,
    MIN(sent_at) as oldest_message,
    MAX(sent_at) as newest_message,
    ROUND(AVG(chars_count), 0) as avg_message_length
  FROM participant_messages;
END;
$$;

COMMENT ON FUNCTION get_participant_messages_stats IS 'Возвращает статистику по хранимым сообщениям';

-- Grant permissions
GRANT SELECT ON participant_messages TO authenticated;
GRANT INSERT ON participant_messages TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_participant_messages TO service_role;
GRANT EXECUTE ON FUNCTION delete_participant_data TO authenticated;
GRANT EXECUTE ON FUNCTION get_participant_messages_stats TO authenticated;

