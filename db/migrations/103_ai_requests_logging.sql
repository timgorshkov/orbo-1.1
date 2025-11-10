-- Migration 103: AI Requests Logging
-- For product analytics and debugging AI-generated apps

-- =====================================================
-- AI REQUESTS (logging for analytics)
-- =====================================================
CREATE TABLE ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User context
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Request details
  request_type TEXT NOT NULL, -- 'create_app', 'edit_app', 'chat_message'
  user_message TEXT NOT NULL, -- What user asked
  ai_response TEXT, -- What AI responded
  
  -- Generated configuration (if applicable)
  generated_config JSONB,
  was_applied BOOLEAN DEFAULT false, -- Did user apply the config?
  
  -- AI metadata
  model TEXT, -- 'gpt-4', 'gpt-3.5-turbo', etc
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  cost_rub DECIMAL(10, 2),
  
  -- App context (if editing existing app)
  app_id UUID REFERENCES apps(id) ON DELETE SET NULL,
  
  -- Session tracking
  conversation_id UUID, -- Group messages in same chat session
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_ai_requests_org ON ai_requests(org_id);
CREATE INDEX idx_ai_requests_user ON ai_requests(user_id);
CREATE INDEX idx_ai_requests_type ON ai_requests(request_type);
CREATE INDEX idx_ai_requests_created ON ai_requests(created_at DESC);
CREATE INDEX idx_ai_requests_applied ON ai_requests(was_applied) WHERE was_applied = true;
CREATE INDEX idx_ai_requests_conversation ON ai_requests(conversation_id) WHERE conversation_id IS NOT NULL;

-- RLS: Only superadmins can view AI requests
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view all AI requests"
  ON ai_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM superadmins
      WHERE superadmins.user_id = auth.uid()
      AND superadmins.is_active = true
    )
  );

-- No other policies - users cannot view/edit their own requests
-- This is purely for internal analytics

-- =====================================================
-- HELPER VIEW: AI Requests with user/org details
-- =====================================================
CREATE OR REPLACE VIEW ai_requests_enriched AS
SELECT
  ar.id,
  ar.request_type,
  ar.user_message,
  ar.ai_response,
  ar.generated_config,
  ar.was_applied,
  ar.model,
  ar.tokens_used,
  ar.cost_usd,
  ar.cost_rub,
  ar.conversation_id,
  ar.created_at,
  
  -- User details (from auth.users, accessible via service role)
  ar.user_id,
  
  -- Org details
  ar.org_id,
  o.name as org_name,
  
  -- App details (if editing)
  ar.app_id,
  a.name as app_name,
  a.app_type
  
FROM ai_requests ar
LEFT JOIN organizations o ON ar.org_id = o.id
LEFT JOIN apps a ON ar.app_id = a.id;

-- Grant view access to service role
GRANT SELECT ON ai_requests_enriched TO service_role;

COMMENT ON TABLE ai_requests IS 'Logs all AI interactions for product analytics and debugging';
COMMENT ON COLUMN ai_requests.request_type IS 'Type of request: create_app, edit_app, chat_message';
COMMENT ON COLUMN ai_requests.was_applied IS 'Whether user applied the generated config';
COMMENT ON COLUMN ai_requests.conversation_id IS 'Groups messages in same chat session';

