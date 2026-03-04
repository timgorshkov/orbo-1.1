-- =====================================================
-- Migration 239: Portal (public space) settings
-- =====================================================
-- Добавляет настройки публичного портала организации:
--   portal_show_events    — показывать раздел «События» в меню участников
--   portal_show_members   — показывать раздел «Участники»
--   portal_show_materials — показывать раздел «Материалы» (по умолчанию скрыт)
--   portal_show_apps      — показывать раздел «Приложения» (по умолчанию скрыт)
--   portal_welcome_html   — приветственный блок (HTML, rich-text) над контентом главной
--
-- Эти настройки влияют на:
--   • отображение пунктов в левом меню и мобильном меню (только в режиме участника)
--   • наличие соответствующего блока на главной странице портала
--   НЕ влияют на доступ к страницам по прямой ссылке.
-- =====================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS portal_show_events    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_members   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_show_materials BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_show_apps      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_welcome_html   TEXT;

COMMENT ON COLUMN organizations.portal_show_events    IS 'Показывать раздел «События» в портале участников';
COMMENT ON COLUMN organizations.portal_show_members   IS 'Показывать раздел «Участники» в портале участников';
COMMENT ON COLUMN organizations.portal_show_materials IS 'Показывать раздел «Материалы» в портале участников (по умолчанию скрыт)';
COMMENT ON COLUMN organizations.portal_show_apps      IS 'Показывать раздел «Приложения» в портале участников (по умолчанию скрыт)';
COMMENT ON COLUMN organizations.portal_welcome_html   IS 'HTML-приветствие на главной странице портала; если заполнено, показывается над всеми блоками';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 239: portal settings columns added to organizations';
END $$;
