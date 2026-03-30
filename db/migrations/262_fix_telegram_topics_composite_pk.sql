-- Migration 262: Fix telegram_topics composite primary key
-- Migration 261 used CREATE TABLE IF NOT EXISTS which was a no-op if the table
-- already existed with a single-column PK on (id) only.
-- ON CONFLICT (id, tg_chat_id) requires a unique/primary key on BOTH columns.

-- 1. Ensure table exists with correct columns
CREATE TABLE IF NOT EXISTS telegram_topics (
  id          BIGINT NOT NULL,
  tg_chat_id  BIGINT NOT NULL,
  title       TEXT   NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add tg_chat_id column if it was missing (old schema may not have it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_topics' AND column_name = 'tg_chat_id'
  ) THEN
    ALTER TABLE telegram_topics ADD COLUMN tg_chat_id BIGINT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Drop existing PK if it's single-column (only on id)
DO $$
DECLARE
  pk_name TEXT;
  pk_cols INT;
BEGIN
  SELECT c.conname, array_length(c.conkey, 1)
  INTO pk_name, pk_cols
  FROM pg_constraint c
  WHERE c.conrelid = 'telegram_topics'::regclass
    AND c.contype = 'p';

  IF FOUND AND pk_cols = 1 THEN
    EXECUTE 'ALTER TABLE telegram_topics DROP CONSTRAINT ' || quote_ident(pk_name);
  END IF;
END $$;

-- 4. Remove duplicate (id, tg_chat_id) rows before adding composite PK
DELETE FROM telegram_topics t1
USING telegram_topics t2
WHERE t1.ctid > t2.ctid
  AND t1.id = t2.id
  AND t1.tg_chat_id = t2.tg_chat_id;

-- 5. Add composite PK (id, tg_chat_id) if no PK exists yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'telegram_topics'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE telegram_topics ADD PRIMARY KEY (id, tg_chat_id);
  END IF;
END $$;

-- 6. Ensure index on tg_chat_id for fast lookups by group
CREATE INDEX IF NOT EXISTS idx_telegram_topics_tg_chat_id
  ON telegram_topics (tg_chat_id);
