-- Migration 178: Add settings to whatsapp_imports
-- Adds show_in_menu toggle and default_tag for imported participants

-- Add show_in_menu column (whether to display in left navigation)
ALTER TABLE whatsapp_imports
  ADD COLUMN IF NOT EXISTS show_in_menu BOOLEAN DEFAULT FALSE;

-- Add default_tag to apply to all participants from this import
ALTER TABLE whatsapp_imports
  ADD COLUMN IF NOT EXISTS default_tag_id UUID REFERENCES participant_tags(id) ON DELETE SET NULL;

-- Add note/description field for admin notes
ALTER TABLE whatsapp_imports
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN whatsapp_imports.show_in_menu IS 'Show this WhatsApp group in the left navigation menu';
COMMENT ON COLUMN whatsapp_imports.default_tag_id IS 'Tag to apply to all participants from this import';
COMMENT ON COLUMN whatsapp_imports.notes IS 'Admin notes about this import';

-- Index for menu display query
CREATE INDEX IF NOT EXISTS idx_whatsapp_imports_show_in_menu 
  ON whatsapp_imports(org_id, show_in_menu) 
  WHERE show_in_menu = TRUE;

