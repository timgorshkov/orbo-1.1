-- =====================================================
-- Migration 241: Portal cover image URL
-- =====================================================
-- Добавляет поле portal_cover_url для хранения обложки
-- главной страницы портала участников.
-- =====================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS portal_cover_url TEXT;

COMMENT ON COLUMN organizations.portal_cover_url IS 'URL обложки главной страницы портала участников (загружается в S3)';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 241: portal_cover_url column added to organizations';
END $$;
