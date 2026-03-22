-- Migration 248: User registration metadata
-- Stores UTM params, referrer, landing page, device info at registration time

CREATE TABLE IF NOT EXISTS public.user_registration_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer_url TEXT,
  landing_page TEXT,
  from_page TEXT,
  device_type TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reg_meta_utm_source ON public.user_registration_meta(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_reg_meta_landing ON public.user_registration_meta(landing_page) WHERE landing_page IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_reg_meta_created ON public.user_registration_meta(created_at);
