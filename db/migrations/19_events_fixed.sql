-- Migration: Events System (Fixed)
-- Description: Tables for events, registrations, and notifications
-- This version drops existing tables first to ensure clean installation

-- =====================================================
-- 0. DROP EXISTING TABLES (if they exist from failed migration)
-- =====================================================
DROP TABLE IF EXISTS public.event_telegram_notifications CASCADE;
DROP TABLE IF EXISTS public.event_registrations CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.get_event_available_spots(UUID);
DROP FUNCTION IF EXISTS public.is_user_registered_for_event(UUID, UUID);
DROP FUNCTION IF EXISTS update_events_updated_at();

-- =====================================================
-- 1. EVENTS TABLE
-- =====================================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  
  -- Event type and location
  event_type TEXT NOT NULL CHECK (event_type IN ('online', 'offline')),
  location_info TEXT, -- Address for offline or link for online events
  
  -- Date and time
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Pricing
  is_paid BOOLEAN NOT NULL DEFAULT false,
  price_info TEXT, -- Description of price and payment method
  
  -- Capacity
  capacity INTEGER, -- NULL means unlimited
  
  -- Status and visibility
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for events
CREATE INDEX idx_events_org_id ON public.events(org_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_event_date ON public.events(event_date);
CREATE INDEX idx_events_org_status_date ON public.events(org_id, status, event_date);

-- =====================================================
-- 2. EVENT REGISTRATIONS TABLE
-- =====================================================
CREATE TABLE public.event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  
  -- Registration info
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  registration_source TEXT DEFAULT 'web' CHECK (registration_source IN ('web', 'telegram', 'admin')),
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one registration per participant per event
  UNIQUE(event_id, participant_id)
);

-- Indexes for event_registrations
CREATE INDEX idx_event_registrations_event_id ON public.event_registrations(event_id);
CREATE INDEX idx_event_registrations_participant_id ON public.event_registrations(participant_id);
CREATE INDEX idx_event_registrations_status ON public.event_registrations(status);

-- =====================================================
-- 3. EVENT TELEGRAM NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE public.event_telegram_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tg_group_id INTEGER NOT NULL REFERENCES public.telegram_groups(id) ON DELETE CASCADE,
  
  -- Notification details
  notification_type TEXT NOT NULL CHECK (notification_type IN ('manual', 'day_before', 'hour_before')),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  message_id BIGINT, -- Telegram message ID
  
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for event_telegram_notifications
CREATE INDEX idx_event_telegram_notifications_event_id ON public.event_telegram_notifications(event_id);
CREATE INDEX idx_event_telegram_notifications_status ON public.event_telegram_notifications(status);
CREATE INDEX idx_event_telegram_notifications_scheduled ON public.event_telegram_notifications(scheduled_at) WHERE status = 'scheduled';

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Trigger to update updated_at on events
CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_updated_at_trigger
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION update_events_updated_at();

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_telegram_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events

-- Public events can be read by anyone
CREATE POLICY "Public events are viewable by everyone"
  ON public.events
  FOR SELECT
  USING (status = 'published' AND is_public = true);

-- Organization members can view all events in their org
CREATE POLICY "Organization members can view their org events"
  ON public.events
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.memberships
      WHERE user_id = auth.uid()
    )
  );

-- Only owner/admin can create events
CREATE POLICY "Only owner/admin can create events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE user_id = auth.uid()
        AND org_id = events.org_id
        AND role IN ('owner', 'admin')
    )
  );

-- Only owner/admin can update events
CREATE POLICY "Only owner/admin can update events"
  ON public.events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE user_id = auth.uid()
        AND org_id = events.org_id
        AND role IN ('owner', 'admin')
    )
  );

-- Only owner/admin can delete events
CREATE POLICY "Only owner/admin can delete events"
  ON public.events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE user_id = auth.uid()
        AND org_id = events.org_id
        AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for event_registrations

-- Users can view registrations for events they have access to
CREATE POLICY "Users can view registrations for accessible events"
  ON public.event_registrations
  FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE org_id IN (
        SELECT org_id FROM public.memberships
        WHERE user_id = auth.uid()
      )
      OR (status = 'published' AND is_public = true)
    )
  );

-- Users can register themselves (INSERT will be handled by API)
CREATE POLICY "Users can register for events"
  ON public.event_registrations
  FOR INSERT
  WITH CHECK (
    participant_id IN (
      SELECT id FROM public.participants
      WHERE org_id IN (
        SELECT org_id FROM public.events
        WHERE id = event_registrations.event_id
      )
    )
  );

-- Users can cancel their own registrations
CREATE POLICY "Users can cancel their registrations"
  ON public.event_registrations
  FOR UPDATE
  USING (
    participant_id IN (
      SELECT id FROM public.participants p
      WHERE p.id = event_registrations.participant_id
    )
  );

-- RLS Policies for event_telegram_notifications

-- Only org admins can view notifications
CREATE POLICY "Org admins can view event notifications"
  ON public.event_telegram_notifications
  FOR SELECT
  USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE org_id IN (
        SELECT org_id FROM public.memberships
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

-- Only org admins can create notifications
CREATE POLICY "Org admins can create event notifications"
  ON public.event_telegram_notifications
  FOR INSERT
  WITH CHECK (
    event_id IN (
      SELECT id FROM public.events
      WHERE org_id IN (
        SELECT org_id FROM public.memberships
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
  );

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to get available spots for an event
CREATE OR REPLACE FUNCTION public.get_event_available_spots(event_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  event_capacity INTEGER;
  registered_count INTEGER;
BEGIN
  -- Get event capacity
  SELECT capacity INTO event_capacity
  FROM public.events
  WHERE id = event_id_param;
  
  -- If no capacity limit, return NULL (unlimited)
  IF event_capacity IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Count registered participants
  SELECT COUNT(*) INTO registered_count
  FROM public.event_registrations
  WHERE event_id = event_id_param
    AND status = 'registered';
  
  -- Return available spots
  RETURN GREATEST(0, event_capacity - registered_count);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user is registered for an event
CREATE OR REPLACE FUNCTION public.is_user_registered_for_event(
  event_id_param UUID,
  participant_id_param UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.event_registrations
    WHERE event_id = event_id_param
      AND participant_id = participant_id_param
      AND status = 'registered'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 7. COMMENTS
-- =====================================================

COMMENT ON TABLE public.events IS 'Events organized by organizations';
COMMENT ON TABLE public.event_registrations IS 'User registrations for events';
COMMENT ON TABLE public.event_telegram_notifications IS 'Telegram notifications for events';
COMMENT ON FUNCTION public.get_event_available_spots IS 'Get number of available spots for an event';
COMMENT ON FUNCTION public.is_user_registered_for_event IS 'Check if a user is registered for an event';

