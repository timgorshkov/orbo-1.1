-- Migration: Add image_url to announcements for image attachments
-- Created: 2026-01-26

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN announcements.image_url IS 'URL изображения, прикреплённого к анонсу (отправляется как фото в Telegram)';
