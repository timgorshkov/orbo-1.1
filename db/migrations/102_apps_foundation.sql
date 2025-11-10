-- =====================================================
-- ORBO APPS: Foundation (MVP)
-- =====================================================
-- Purpose: AI-generated applications for communities
-- Architecture: Flexible collections with JSONB schemas
-- =====================================================

-- =====================================================
-- EXTENSIONS (for geo queries)
-- =====================================================
-- Note: earthdistance provides ll_to_earth() for geo indexing
-- If not available on your Supabase instance, we'll use simple indexes instead
-- Uncomment if available:
-- CREATE EXTENSION IF NOT EXISTS cube;
-- CREATE EXTENSION IF NOT EXISTS earthdistance;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- APPS (main entity)
-- =====================================================
CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- emoji or URL
  
  -- App type (for analytics, not for logic)
  app_type TEXT DEFAULT 'custom', -- 'classifieds', 'issues', 'events', 'custom'
  
  -- AI-generated configuration
  config JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "telegram_commands": ["/post", "/my_ads", "/moderate"],
  --   "notifications": { "new_item": true, "moderation": true },
  --   "features": ["moderation", "categories", "location"]
  -- }
  
  -- Status
  status TEXT DEFAULT 'active', -- active, paused, archived
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_apps_org ON apps(org_id);
CREATE INDEX idx_apps_status ON apps(status);

-- =====================================================
-- APP COLLECTIONS (data models)
-- =====================================================
CREATE TABLE app_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  
  -- Collection identity
  name TEXT NOT NULL, -- 'listings', 'issues', 'events', 'rsvps', etc
  display_name TEXT NOT NULL, -- 'Объявления', 'Инциденты'
  icon TEXT, -- emoji
  
  -- AI-generated schema
  schema JSONB NOT NULL,
  -- Example:
  -- {
  --   "fields": [
  --     { "name": "title", "type": "text", "required": true, "label": "Название" },
  --     { "name": "price", "type": "number", "required": false, "label": "Цена" },
  --     { "name": "category", "type": "select", "options": ["Авто", "Техника"], "label": "Категория" },
  --     { "name": "photos", "type": "images", "max": 5, "label": "Фотографии" },
  --     { "name": "location", "type": "geo", "label": "Местоположение" }
  --   ]
  -- }
  
  -- Permissions (who can do what)
  permissions JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "create": ["member"],
  --   "read": ["all"],
  --   "edit": ["owner", "admin"],
  --   "delete": ["owner", "admin"],
  --   "moderate": ["admin", "moderator"]
  -- }
  
  -- Workflows (triggers + actions)
  workflows JSONB DEFAULT '[]',
  -- Example:
  -- [
  --   { "trigger": "onCreate", "action": "notify_moderators", "condition": "status=pending" },
  --   { "trigger": "onApprove", "action": "post_to_telegram" },
  --   { "trigger": "onUpdate", "action": "notify_creator" }
  -- ]
  
  -- Available views
  views JSONB DEFAULT '["list"]',
  -- Example: ["list", "grid", "map", "calendar", "board"]
  
  -- Moderation settings
  moderation_enabled BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(app_id, name)
);

CREATE INDEX idx_collections_app ON app_collections(app_id);

-- =====================================================
-- APP ITEMS (universal data storage)
-- =====================================================
CREATE TABLE app_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES app_collections(id) ON DELETE CASCADE,
  
  -- Flexible data (AI-generated schema)
  data JSONB NOT NULL,
  -- Example for classifieds:
  -- {
  --   "title": "Продаю iPhone 13",
  --   "price": 45000,
  --   "category": "Техника",
  --   "description": "Отличное состояние...",
  --   "contact": "@username"
  -- }
  
  -- Files/media
  images TEXT[] DEFAULT '{}',
  files TEXT[] DEFAULT '{}',
  
  -- Location (for geo queries)
  location_lat DOUBLE PRECISION,
  location_lon DOUBLE PRECISION,
  location_address TEXT,
  
  -- Status (flexible workflow)
  status TEXT DEFAULT 'pending', -- pending, active, sold, archived, rejected, etc
  
  -- Ownership & permissions
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id), -- denormalized for RLS
  
  -- Moderation
  moderated_by UUID REFERENCES auth.users(id),
  moderated_at TIMESTAMPTZ,
  moderation_note TEXT,
  
  -- Metrics
  views_count INT DEFAULT 0,
  reactions_count INT DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- optional expiration
);

CREATE INDEX idx_items_collection ON app_items(collection_id);
CREATE INDEX idx_items_creator ON app_items(creator_id);
CREATE INDEX idx_items_org ON app_items(org_id);
CREATE INDEX idx_items_status ON app_items(status);
CREATE INDEX idx_items_created ON app_items(created_at DESC);

-- Simple composite index for location queries (MVP approach)
-- For more advanced geo queries, consider PostGIS or earthdistance extension later
CREATE INDEX idx_items_location ON app_items(location_lat, location_lon)
  WHERE location_lat IS NOT NULL AND location_lon IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX idx_items_data ON app_items USING gin(data);

-- =====================================================
-- APP ITEM REACTIONS (likes, confirms, votes)
-- =====================================================
CREATE TABLE app_item_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES app_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  reaction_type TEXT NOT NULL, -- 'like', 'confirm', 'upvote', 'downvote', etc
  
  -- Optional data (e.g., evidence for confirmations)
  data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(item_id, user_id, reaction_type)
);

CREATE INDEX idx_reactions_item ON app_item_reactions(item_id);
CREATE INDEX idx_reactions_user ON app_item_reactions(user_id);

-- =====================================================
-- APP ITEM COMMENTS (messages, responses)
-- =====================================================
CREATE TABLE app_item_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES app_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  body TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  
  -- For threading
  parent_id UUID REFERENCES app_item_comments(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_item ON app_item_comments(item_id);
CREATE INDEX idx_comments_user ON app_item_comments(user_id);
CREATE INDEX idx_comments_parent ON app_item_comments(parent_id) WHERE parent_id IS NOT NULL;

-- =====================================================
-- APP ANALYTICS (usage tracking)
-- =====================================================
CREATE TABLE app_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- 'item_created', 'item_viewed', 'item_moderated', 'reaction_added'
  
  -- Context
  user_id UUID REFERENCES auth.users(id),
  item_id UUID REFERENCES app_items(id),
  collection_id UUID REFERENCES app_collections(id),
  
  -- Additional data
  data JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_app ON app_analytics_events(app_id, created_at DESC);
CREATE INDEX idx_analytics_type ON app_analytics_events(event_type, created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- APPS: Users can only see apps in their orgs
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view apps in their orgs"
  ON apps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = apps.org_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can create apps"
  ON apps FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = apps.org_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update apps"
  ON apps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = apps.org_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- APP_COLLECTIONS: Follow app visibility
ALTER TABLE app_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view collections in their orgs"
  ON app_collections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apps
      JOIN memberships ON memberships.org_id = apps.org_id
      WHERE apps.id = app_collections.app_id
      AND memberships.user_id = auth.uid()
    )
  );

-- APP_ITEMS: Complex permissions based on collection config
ALTER TABLE app_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items in their orgs"
  ON app_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = app_items.org_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create items"
  ON app_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = app_items.org_id
      AND memberships.user_id = auth.uid()
    )
    AND creator_id = auth.uid()
  );

CREATE POLICY "Owners can update their items"
  ON app_items FOR UPDATE
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = app_items.org_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "Owners can delete their items"
  ON app_items FOR DELETE
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.org_id = app_items.org_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- APP_ITEM_REACTIONS: Members can react
ALTER TABLE app_item_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions"
  ON app_item_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM app_items
      JOIN memberships ON memberships.org_id = app_items.org_id
      WHERE app_items.id = app_item_reactions.item_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can add reactions"
  ON app_item_reactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_items
      JOIN memberships ON memberships.org_id = app_items.org_id
      WHERE app_items.id = app_item_reactions.item_id
      AND memberships.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can delete own reactions"
  ON app_item_reactions FOR DELETE
  USING (user_id = auth.uid());

-- APP_ITEM_COMMENTS: Members can comment
ALTER TABLE app_item_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments"
  ON app_item_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM app_items
      JOIN memberships ON memberships.org_id = app_items.org_id
      WHERE app_items.id = app_item_comments.item_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can add comments"
  ON app_item_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_items
      JOIN memberships ON memberships.org_id = app_items.org_id
      WHERE app_items.id = app_item_comments.item_id
      AND memberships.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update own comments"
  ON app_item_comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON app_item_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM app_items
      JOIN memberships ON memberships.org_id = app_items.org_id
      WHERE app_items.id = app_item_comments.item_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin', 'moderator')
    )
  );

-- APP_ANALYTICS_EVENTS: Only admins can view
ALTER TABLE app_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view analytics"
  ON app_analytics_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM apps
      JOIN memberships ON memberships.org_id = apps.org_id
      WHERE apps.id = app_analytics_events.app_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at on apps
CREATE TRIGGER update_apps_updated_at
  BEFORE UPDATE ON apps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update updated_at on collections
CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON app_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update updated_at on items
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON app_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update updated_at on comments
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON app_item_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Check if user has permission to perform action on item
CREATE OR REPLACE FUNCTION check_item_permission(
  p_item_id UUID,
  p_user_id UUID,
  p_action TEXT -- 'read', 'edit', 'delete', 'moderate'
) RETURNS BOOLEAN AS $$
DECLARE
  v_item app_items;
  v_membership memberships;
BEGIN
  -- Get item
  SELECT * INTO v_item FROM app_items WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Get membership
  SELECT * INTO v_membership
  FROM memberships
  WHERE org_id = v_item.org_id
  AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check permissions
  IF p_action = 'read' THEN
    RETURN TRUE; -- All members can read
  ELSIF p_action = 'edit' THEN
    RETURN v_item.creator_id = p_user_id 
           OR v_membership.role IN ('owner', 'admin', 'moderator');
  ELSIF p_action = 'delete' THEN
    RETURN v_item.creator_id = p_user_id 
           OR v_membership.role IN ('owner', 'admin');
  ELSIF p_action = 'moderate' THEN
    RETURN v_membership.role IN ('owner', 'admin', 'moderator');
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log analytics event
CREATE OR REPLACE FUNCTION log_app_event(
  p_app_id UUID,
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_item_id UUID DEFAULT NULL,
  p_collection_id UUID DEFAULT NULL,
  p_data JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO app_analytics_events (
    app_id, event_type, user_id, item_id, collection_id, data
  ) VALUES (
    p_app_id, p_event_type, p_user_id, p_item_id, p_collection_id, p_data
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE apps IS 'AI-generated applications for communities';
COMMENT ON TABLE app_collections IS 'Data models (collections) within apps';
COMMENT ON TABLE app_items IS 'Universal storage for all app data (JSONB)';
COMMENT ON TABLE app_item_reactions IS 'Likes, confirms, votes, etc';
COMMENT ON TABLE app_item_comments IS 'Comments and messages on items';
COMMENT ON TABLE app_analytics_events IS 'Usage tracking for apps';

COMMENT ON COLUMN apps.config IS 'AI-generated configuration (Telegram commands, notifications, features)';
COMMENT ON COLUMN app_collections.schema IS 'AI-generated field schema (types, validations, labels)';
COMMENT ON COLUMN app_collections.permissions IS 'Who can create/read/edit/delete/moderate';
COMMENT ON COLUMN app_collections.workflows IS 'Triggers and actions (onCreate, onApprove, etc)';
COMMENT ON COLUMN app_items.data IS 'Flexible JSONB data matching collection schema';

