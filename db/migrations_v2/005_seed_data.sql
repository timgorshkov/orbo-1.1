-- Seed Data for Fresh Deployment
-- Run after all schema migrations

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

-- Event covers bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-covers',
  'event-covers',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- App files bucket (for ORBO Apps)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-files',
  'app-files',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- INITIAL SUPERADMIN (update email after deployment)
-- ============================================================================

-- Note: Add your superadmin after first user registers
-- INSERT INTO public.superadmins (user_id, email, is_active)
-- SELECT id, email, true FROM auth.users WHERE email = 'your-admin@email.com';

DO $$ BEGIN 
  RAISE NOTICE 'Seed data applied successfully.';
  RAISE NOTICE 'Remember to add your superadmin user after first registration!';
END $$;

