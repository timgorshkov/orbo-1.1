-- =====================================================
-- Migration: Apps Visual Customization
-- =====================================================
-- Purpose: Add visual customization fields to apps
-- Date: 2025-11-16
-- =====================================================

-- =====================================================
-- STEP 1: Add visual customization fields to apps
-- =====================================================

ALTER TABLE apps 
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#3B82F6', -- Blue-600
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#10B981', -- Green-500
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS custom_css TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_apps_org_status ON apps(org_id, status);

COMMENT ON COLUMN apps.primary_color IS 'Primary brand color (hex format #RRGGBB)';
COMMENT ON COLUMN apps.secondary_color IS 'Secondary brand color (hex format #RRGGBB)';
COMMENT ON COLUMN apps.logo_url IS 'App logo URL (uploaded to Supabase Storage)';
COMMENT ON COLUMN apps.custom_css IS 'Custom CSS for advanced styling (optional)';

-- =====================================================
-- STEP 2: Add field customization to app_collections.schema
-- =====================================================
-- Note: This is already stored in schema JSONB, no migration needed
-- Extended schema format:
-- {
--   "fields": [
--     {
--       "name": "title",
--       "type": "text",
--       "required": true,
--       "label": "Название",
--       "custom_label": "Заголовок объявления", -- NEW: custom label
--       "order": 1,                               -- NEW: field order
--       "visible": true,                          -- NEW: show/hide field
--       "placeholder": "Введите название...",     -- NEW: placeholder text
--       "help_text": "Краткое описание товара"    -- NEW: help text
--     }
--   ]
-- }

COMMENT ON COLUMN app_collections.schema IS 'AI-generated field schema (types, validations, labels, order, visibility)';

-- =====================================================
-- STEP 3: Create helper function to get app theme
-- =====================================================

CREATE OR REPLACE FUNCTION get_app_theme(p_app_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_theme JSONB;
BEGIN
  SELECT jsonb_build_object(
    'primary_color', primary_color,
    'secondary_color', secondary_color,
    'logo_url', logo_url,
    'custom_css', custom_css
  ) INTO v_theme
  FROM apps
  WHERE id = p_app_id;
  
  RETURN v_theme;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_app_theme IS 'Get theme configuration for an app';

-- =====================================================
-- STEP 4: Verification
-- =====================================================

DO $$
DECLARE
  apps_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO apps_count FROM apps;
  
  RAISE NOTICE 'Visual customization migration complete!';
  RAISE NOTICE '  Total apps: %', apps_count;
  RAISE NOTICE '  New fields: primary_color, secondary_color, logo_url, custom_css';
  RAISE NOTICE '  Extended schema supports: custom_label, order, visible, placeholder, help_text';
END $$;

