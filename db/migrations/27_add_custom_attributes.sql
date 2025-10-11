-- Добавление поля custom_attributes в таблицу participants
-- Версия: 27

-- Добавляем поле custom_attributes для хранения произвольных характеристик участника
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb;

-- Создаем индекс для быстрого поиска по custom_attributes
CREATE INDEX IF NOT EXISTS idx_participants_custom_attributes 
ON public.participants USING gin (custom_attributes);

-- Комментарий для документации
COMMENT ON COLUMN public.participants.custom_attributes IS 
'JSON поле для хранения произвольных характеристик участника (должность, город, интересы и т.д.)';

