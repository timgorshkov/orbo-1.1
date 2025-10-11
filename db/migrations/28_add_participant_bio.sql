-- Добавление поля bio (краткое описание) в таблицу participants
-- Версия: 28

-- Добавляем поле bio для краткого описания участника (до 60 символов)
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS bio text;

-- Добавляем проверку на максимальную длину
ALTER TABLE public.participants
ADD CONSTRAINT bio_max_length CHECK (char_length(bio) <= 60);

-- Создаем индекс для быстрого поиска по bio
CREATE INDEX IF NOT EXISTS idx_participants_bio 
ON public.participants USING gin (to_tsvector('russian', coalesce(bio, '')));

-- Комментарий для документации
COMMENT ON COLUMN public.participants.bio IS 
'Краткое описание участника (до 60 символов): должность, интересы, специализация и т.д.';

