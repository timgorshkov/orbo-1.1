-- Добавляем поля для отслеживания источника импорта сообщений
ALTER TABLE activity_events 
ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'webhook' 
  CHECK (import_source IN ('webhook', 'html_import', 'manual')),
ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Комментарии для документации
COMMENT ON COLUMN activity_events.import_source IS 'Источник события: webhook (реал-тайм из Telegram), html_import (загрузка истории), manual (ручное добавление)';
COMMENT ON COLUMN activity_events.import_batch_id IS 'UUID батча для группировки импортированных сообщений';

-- Индекс для быстрого поиска по батчам импорта
CREATE INDEX IF NOT EXISTS idx_activity_import_batch 
ON activity_events(import_batch_id) 
WHERE import_batch_id IS NOT NULL;

-- Индекс для дедупликации импортированных сообщений
-- (чат, пользователь, время, длина текста - уникальная комбинация)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_dedup_imported
ON activity_events(tg_chat_id, tg_user_id, created_at, chars_count)
WHERE event_type = 'message' AND import_source = 'html_import' AND tg_user_id IS NOT NULL;

-- Таблица для хранения метаданных о батчах импорта
CREATE TABLE IF NOT EXISTS telegram_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tg_chat_id BIGINT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  total_messages INTEGER NOT NULL,
  imported_messages INTEGER DEFAULT 0,
  new_participants INTEGER DEFAULT 0,
  matched_participants INTEGER DEFAULT 0,
  date_range_start TIMESTAMP WITH TIME ZONE,
  date_range_end TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'reviewed', 'importing', 'completed', 'failed')),
  imported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Индексы для таблицы батчей
CREATE INDEX IF NOT EXISTS idx_import_batches_org ON telegram_import_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_chat ON telegram_import_batches(tg_chat_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON telegram_import_batches(status);

-- Комментарий
COMMENT ON TABLE telegram_import_batches IS 'Метаданные о батчах импорта истории чата из HTML экспорта Telegram';


