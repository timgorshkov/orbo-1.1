-- Migration 093: Add Goals and Enrichment Schema
-- Date: November 5, 2025
-- Purpose: Add foundation for goal-driven analytics and participant enrichment

-- ============================================================================
-- PART 1: ORGANIZATION GOALS & CONTEXT
-- ============================================================================

-- Add goals and focus areas to organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS goals JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS focus_areas TEXT[] DEFAULT '{}';

-- Already have timezone from migration 084, but ensure it exists
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Index for querying by goals
CREATE INDEX IF NOT EXISTS idx_organizations_goals 
ON public.organizations USING gin (goals);

COMMENT ON COLUMN public.organizations.goals IS 
'Organization objectives and weights for goal-driven analytics.
Example:
{
  "retention": 0.35,
  "networking": 0.25,
  "events_attendance": 0.20,
  "content_quality": 0.10,
  "monetization": 0.10
}
Weights should sum to 1.0';

COMMENT ON COLUMN public.organizations.focus_areas IS 
'Main focus areas for the organization (e.g., ["Нетворкинг", "Образование", "Мероприятия"])';

-- ============================================================================
-- PART 2: GROUP GOALS & CONTEXT
-- ============================================================================

-- Add goals and keywords to telegram_groups
ALTER TABLE public.telegram_groups
ADD COLUMN IF NOT EXISTS group_goals JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for querying by group goals and keywords
CREATE INDEX IF NOT EXISTS idx_telegram_groups_goals 
ON public.telegram_groups USING gin (group_goals);

CREATE INDEX IF NOT EXISTS idx_telegram_groups_keywords 
ON public.telegram_groups USING gin (keywords);

COMMENT ON COLUMN public.telegram_groups.group_goals IS 
'Group-specific goals and context for analytics.
Example:
{
  "purpose": "Networking",
  "focus": ["Deals", "Partnerships", "B2B"],
  "tone": "professional"
}';

COMMENT ON COLUMN public.telegram_groups.keywords IS 
'Domain-specific keywords for this group (e.g., ["сделка", "партнёрство", "заказ", "B2B"]).
Used to boost relevance in interest extraction and topic detection.';

COMMENT ON COLUMN public.telegram_groups.description IS 
'Human-readable description of the group purpose and rules (shown to participants)';

-- ============================================================================
-- PART 3: PARTICIPANT ENRICHMENT (via custom_attributes)
-- ============================================================================

-- custom_attributes already exists from migration 27, but let's ensure it's there
ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;

-- Ensure GIN index exists for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_participants_custom_attributes 
ON public.participants USING gin (custom_attributes);

-- Update comment with enrichment schema
COMMENT ON COLUMN public.participants.custom_attributes IS 
'Flexible JSONB field for participant enrichment and custom attributes.

ENRICHMENT STRUCTURE (auto-populated):
{
  // AI-extracted (rule-based)
  "interests_keywords": ["PPC", "рекрутинг", "мероприятия"],
  "interests_weights": {"PPC": 0.45, "рекрутинг": 0.30, "мероприятия": 0.25},
  "city_inferred": "Москва",
  "city_confidence": 0.83,
  "behavioral_role": "helper",  // helper|bridge|observer|broadcaster
  "role_confidence": 0.72,
  "topics_discussed": {
    "PPC": 15,
    "дизайн": 8,
    "мероприятия": 12
  },
  "communication_style": {
    "asks_questions": 0.3,
    "gives_answers": 0.7,
    "reply_rate": 0.65,
    "avg_response_time_hours": 2.5
  },
  
  // User-defined (editable by participant or admin)
  "goals_self": "Найти подрядчика по веб-дизайну",
  "offers": ["Консультации по PPC", "Менторство"],
  "asks": ["Помощь с настройкой Яндекс Директ"],
  "city_confirmed": "Москва",  // User-confirmed city
  "bio_custom": "Специалист по контекстной рекламе",
  
  // Events behavior (auto-calculated)
  "event_attendance": {
    "online_rate": 0.6,
    "offline_rate": 0.9,
    "no_show_rate": 0.1,
    "last_attended": "2025-10-28",
    "total_events": 15
  },
  
  // Meta (system fields)
  "last_enriched_at": "2025-11-05T12:00:00Z",
  "enrichment_version": "1.0",
  "enrichment_source": "auto|manual|hybrid"
}

CUSTOM ATTRIBUTES (admin-defined):
Any additional fields can be added by admins (e.g., "department", "tenure", "badges")
';

-- ============================================================================
-- PART 4: ACTIVITY EVENTS ENHANCEMENTS
-- ============================================================================

-- Add reply_to_user_id for better network analysis
-- (reply_to_message_id exists, but we want direct user reference)
ALTER TABLE public.activity_events
ADD COLUMN IF NOT EXISTS reply_to_user_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_activity_events_reply_to_user 
ON public.activity_events (reply_to_user_id) WHERE reply_to_user_id IS NOT NULL;

COMMENT ON COLUMN public.activity_events.reply_to_user_id IS 
'Telegram user ID of the person being replied to (for network analysis).
Extracted from reply_to_message_id by joining with original message.';

-- ============================================================================
-- PART 5: HELPER FUNCTIONS
-- ============================================================================

-- Function to get participant's enrichment data
CREATE OR REPLACE FUNCTION public.get_participant_enrichment(p_participant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrichment JSONB;
BEGIN
  SELECT custom_attributes
  INTO v_enrichment
  FROM public.participants
  WHERE id = p_participant_id;
  
  RETURN COALESCE(v_enrichment, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_participant_enrichment(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_participant_enrichment(UUID) IS 
'Returns the enrichment data for a participant (custom_attributes JSONB).
Used by enrichment service and analytics.';

-- Function to update participant enrichment (merge, don't replace)
CREATE OR REPLACE FUNCTION public.update_participant_enrichment(
  p_participant_id UUID,
  p_enrichment_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.participants
  SET 
    custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || p_enrichment_data,
    updated_at = NOW()
  WHERE id = p_participant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_participant_enrichment(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.update_participant_enrichment(UUID, JSONB) IS 
'Merges new enrichment data into participant custom_attributes.
Preserves existing fields, only updates provided fields.';

-- ============================================================================
-- PART 6: DEFAULT GOALS FOR EXISTING ORGS
-- ============================================================================

-- Set sensible defaults for existing organizations
UPDATE public.organizations
SET goals = jsonb_build_object(
  'retention', 0.35,
  'networking', 0.25,
  'events_attendance', 0.20,
  'content_quality', 0.10,
  'monetization', 0.10
)
WHERE goals = '{}'::jsonb OR goals IS NULL;

UPDATE public.organizations
SET focus_areas = ARRAY['Вовлечённость', 'Нетворкинг']
WHERE focus_areas = '{}' OR focus_areas IS NULL;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$ 
DECLARE
  v_org_count INTEGER;
  v_group_count INTEGER;
  v_participant_count INTEGER;
BEGIN
  -- Count orgs with goals
  SELECT COUNT(*) INTO v_org_count
  FROM public.organizations
  WHERE goals IS NOT NULL AND goals != '{}'::jsonb;
  
  -- Count groups
  SELECT COUNT(*) INTO v_group_count
  FROM public.telegram_groups;
  
  -- Count participants with custom_attributes
  SELECT COUNT(*) INTO v_participant_count
  FROM public.participants
  WHERE custom_attributes IS NOT NULL;
  
  RAISE NOTICE 'Migration 093 Complete:';
  RAISE NOTICE '  - Organizations with goals: %', v_org_count;
  RAISE NOTICE '  - Telegram groups ready for enrichment: %', v_group_count;
  RAISE NOTICE '  - Participants ready for enrichment: %', v_participant_count;
END $$;

