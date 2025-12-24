-- ============================================
-- Миграция 177: Добавление платформы мессенджера
-- ============================================
-- Подготовка к мульти-платформенной архитектуре (Telegram, MAX, и т.д.)
-- Эта миграция добавляет enum и колонки platform во все ключевые таблицы

-- 1. Создаём enum для платформы мессенджера
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messenger_platform') THEN
    CREATE TYPE messenger_platform AS ENUM ('telegram', 'max', 'whatsapp');
  END IF;
END$$;

-- 2. Добавляем колонку platform в telegram_groups
-- Примечание: таблица останется с названием telegram_groups для обратной совместимости
ALTER TABLE public.telegram_groups 
  ADD COLUMN IF NOT EXISTS platform messenger_platform DEFAULT 'telegram';

-- 3. Добавляем колонку platform в org_telegram_groups
ALTER TABLE public.org_telegram_groups
  ADD COLUMN IF NOT EXISTS platform messenger_platform DEFAULT 'telegram';

-- 4. Добавляем колонки в participants
-- platform - для идентификации источника пользователя
-- platform_user_id - универсальный ID на платформе (строка для совместимости)
ALTER TABLE public.participants 
  ADD COLUMN IF NOT EXISTS platform messenger_platform DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS platform_user_id TEXT;

-- 5. Заполняем platform_user_id из tg_user_id для существующих записей
UPDATE public.participants 
SET platform_user_id = tg_user_id::TEXT 
WHERE tg_user_id IS NOT NULL AND platform_user_id IS NULL;

-- 6. Добавляем platform в activity_events
ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS platform messenger_platform DEFAULT 'telegram';

-- 7. Добавляем platform в participant_messages
ALTER TABLE public.participant_messages
  ADD COLUMN IF NOT EXISTS platform messenger_platform DEFAULT 'telegram';

-- 8. Создаём индексы для быстрого поиска по платформе
CREATE INDEX IF NOT EXISTS idx_telegram_groups_platform 
  ON public.telegram_groups(platform);

CREATE INDEX IF NOT EXISTS idx_org_telegram_groups_platform 
  ON public.org_telegram_groups(platform);

CREATE INDEX IF NOT EXISTS idx_participants_platform 
  ON public.participants(platform);

CREATE INDEX IF NOT EXISTS idx_participants_platform_user 
  ON public.participants(platform, platform_user_id);

CREATE INDEX IF NOT EXISTS idx_activity_events_platform 
  ON public.activity_events(platform);

CREATE INDEX IF NOT EXISTS idx_participant_messages_platform 
  ON public.participant_messages(platform);

-- 9. Комментарии для документации
COMMENT ON TYPE messenger_platform IS 'Поддерживаемые платформы мессенджеров: telegram, max, whatsapp';
COMMENT ON COLUMN public.telegram_groups.platform IS 'Платформа мессенджера для этой группы';
COMMENT ON COLUMN public.participants.platform IS 'Основная платформа участника';
COMMENT ON COLUMN public.participants.platform_user_id IS 'ID пользователя на платформе (строка для универсальности)';

