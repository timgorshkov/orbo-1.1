-- Migration: Add retry_count to announcements for automatic retries on failure
-- Created: 2026-01-26

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

COMMENT ON COLUMN announcements.retry_count IS 'Количество попыток отправки. При сбое анонс возвращается в scheduled (до 3 попыток).';
