-- =====================================================
-- Telegram Channels Support
-- Migration: 202_telegram_channels.sql
-- 
-- Adds complete infrastructure for Telegram channels:
-- - Channel storage and metadata
-- - Organization-channel mapping
-- - Channel posts tracking
-- - Post statistics (views, forwards, reactions)
-- - Subscriber analytics
-- =====================================================

-- =====================================================
-- 1. TELEGRAM CHANNELS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.telegram_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_chat_id BIGINT NOT NULL UNIQUE,
  username TEXT,                          -- @channel_username
  title TEXT NOT NULL,
  description TEXT,
  
  -- Subscriber info
  subscriber_count INT DEFAULT 0,
  subscriber_count_updated_at TIMESTAMPTZ,
  
  -- Linked discussion group (for comments)
  linked_chat_id BIGINT,                  -- ID группы комментариев
  
  -- Bot status
  bot_status TEXT DEFAULT 'pending' CHECK (bot_status IN ('pending', 'connected', 'kicked', 'error')),
  bot_added_at TIMESTAMPTZ,
  
  -- Photo
  photo_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_post_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_channels_username ON telegram_channels(username);
CREATE INDEX IF NOT EXISTS idx_telegram_channels_linked_chat ON telegram_channels(linked_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_channels_bot_status ON telegram_channels(bot_status);

-- Update trigger
CREATE OR REPLACE FUNCTION update_telegram_channel_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telegram_channels_updated_at ON telegram_channels;
CREATE TRIGGER trg_telegram_channels_updated_at
  BEFORE UPDATE ON telegram_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_channel_updated_at();

-- =====================================================
-- 2. ORG-CHANNEL MAPPING TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.org_telegram_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  
  -- Who added this channel
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Settings per org
  is_primary BOOLEAN DEFAULT FALSE,       -- Main channel for org
  track_analytics BOOLEAN DEFAULT TRUE,
  
  UNIQUE(org_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_org_telegram_channels_org ON org_telegram_channels(org_id);
CREATE INDEX IF NOT EXISTS idx_org_telegram_channels_channel ON org_telegram_channels(channel_id);

-- =====================================================
-- 3. CHANNEL POSTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.channel_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  tg_message_id BIGINT NOT NULL,
  
  -- Content
  text TEXT,
  caption TEXT,                           -- For media posts
  has_media BOOLEAN DEFAULT FALSE,
  media_type TEXT,                        -- 'photo', 'video', 'document', 'audio', 'animation', etc.
  
  -- Engagement metrics (updated periodically)
  views_count INT DEFAULT 0,
  forwards_count INT DEFAULT 0,
  reactions_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  
  -- Calculated metrics
  engagement_rate NUMERIC(5,4) GENERATED ALWAYS AS (
    CASE WHEN views_count > 0 
      THEN (reactions_count + comments_count + forwards_count)::NUMERIC / views_count 
      ELSE 0 
    END
  ) STORED,
  
  -- Timestamps
  posted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  stats_updated_at TIMESTAMPTZ,
  
  UNIQUE(channel_id, tg_message_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_posts_channel ON channel_posts(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_posts_posted_at ON channel_posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_posts_views ON channel_posts(views_count DESC);
CREATE INDEX IF NOT EXISTS idx_channel_posts_engagement ON channel_posts(engagement_rate DESC);

-- Update trigger
DROP TRIGGER IF EXISTS trg_channel_posts_updated_at ON channel_posts;
CREATE TRIGGER trg_channel_posts_updated_at
  BEFORE UPDATE ON channel_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_channel_updated_at();

-- =====================================================
-- 4. POST REACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.channel_post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
  tg_user_id BIGINT,                      -- May be null for anonymous reactions
  emoji TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(post_id, tg_user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_channel_post_reactions_post ON channel_post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_channel_post_reactions_user ON channel_post_reactions(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_channel_post_reactions_emoji ON channel_post_reactions(emoji);

-- =====================================================
-- 5. CHANNEL SUBSCRIBERS (Active readers from reactions/comments)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.channel_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  tg_user_id BIGINT NOT NULL,
  
  -- User info (if available)
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  
  -- Activity metrics
  reactions_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Link to participant if exists
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  
  UNIQUE(channel_id, tg_user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_subscribers_channel ON channel_subscribers(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_user ON channel_subscribers(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_activity ON channel_subscribers(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_subscribers_participant ON channel_subscribers(participant_id);

-- =====================================================
-- 6. CHANNEL STATS SNAPSHOTS (Daily aggregates)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.channel_stats_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Subscriber metrics
  subscriber_count INT DEFAULT 0,
  subscriber_change INT DEFAULT 0,        -- Change from previous day
  
  -- Content metrics
  posts_count INT DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  total_reactions INT DEFAULT 0,
  total_comments INT DEFAULT 0,
  total_forwards INT DEFAULT 0,
  
  -- Calculated
  avg_views_per_post NUMERIC(10,2) DEFAULT 0,
  avg_engagement_rate NUMERIC(5,4) DEFAULT 0,
  active_readers INT DEFAULT 0,           -- Unique users who reacted/commented
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(channel_id, date)
);

CREATE INDEX IF NOT EXISTS idx_channel_stats_daily_channel_date ON channel_stats_daily(channel_id, date DESC);

-- =====================================================
-- 7. RPC: GET CHANNEL BY TG_CHAT_ID
-- =====================================================
CREATE OR REPLACE FUNCTION get_channel_by_tg_id(p_tg_chat_id BIGINT)
RETURNS TABLE(
  id UUID,
  tg_chat_id BIGINT,
  username TEXT,
  title TEXT,
  subscriber_count INT,
  linked_chat_id BIGINT,
  bot_status TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.tg_chat_id,
    c.username,
    c.title,
    c.subscriber_count,
    c.linked_chat_id,
    c.bot_status
  FROM telegram_channels c
  WHERE c.tg_chat_id = p_tg_chat_id;
END;
$$;

-- =====================================================
-- 8. RPC: UPSERT CHANNEL
-- =====================================================
CREATE OR REPLACE FUNCTION upsert_telegram_channel(
  p_tg_chat_id BIGINT,
  p_title TEXT,
  p_username TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_subscriber_count INT DEFAULT NULL,
  p_linked_chat_id BIGINT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  INSERT INTO telegram_channels (
    tg_chat_id, title, username, description, 
    subscriber_count, subscriber_count_updated_at,
    linked_chat_id, photo_url, bot_status, bot_added_at
  )
  VALUES (
    p_tg_chat_id, p_title, p_username, p_description,
    COALESCE(p_subscriber_count, 0), 
    CASE WHEN p_subscriber_count IS NOT NULL THEN NOW() ELSE NULL END,
    p_linked_chat_id, p_photo_url, 'connected', NOW()
  )
  ON CONFLICT (tg_chat_id) DO UPDATE SET
    title = COALESCE(EXCLUDED.title, telegram_channels.title),
    username = COALESCE(EXCLUDED.username, telegram_channels.username),
    description = COALESCE(EXCLUDED.description, telegram_channels.description),
    subscriber_count = COALESCE(EXCLUDED.subscriber_count, telegram_channels.subscriber_count),
    subscriber_count_updated_at = CASE 
      WHEN EXCLUDED.subscriber_count IS NOT NULL THEN NOW() 
      ELSE telegram_channels.subscriber_count_updated_at 
    END,
    linked_chat_id = COALESCE(EXCLUDED.linked_chat_id, telegram_channels.linked_chat_id),
    photo_url = COALESCE(EXCLUDED.photo_url, telegram_channels.photo_url),
    bot_status = 'connected',
    last_sync_at = NOW()
  RETURNING id INTO v_channel_id;
  
  RETURN v_channel_id;
END;
$$;

-- =====================================================
-- 9. RPC: UPSERT CHANNEL POST
-- =====================================================
CREATE OR REPLACE FUNCTION upsert_channel_post(
  p_channel_tg_id BIGINT,
  p_message_id BIGINT,
  p_text TEXT DEFAULT NULL,
  p_caption TEXT DEFAULT NULL,
  p_has_media BOOLEAN DEFAULT FALSE,
  p_media_type TEXT DEFAULT NULL,
  p_views_count INT DEFAULT 0,
  p_forwards_count INT DEFAULT 0,
  p_posted_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id UUID;
  v_post_id UUID;
BEGIN
  -- Get channel UUID
  SELECT id INTO v_channel_id
  FROM telegram_channels
  WHERE tg_chat_id = p_channel_tg_id;
  
  IF v_channel_id IS NULL THEN
    RAISE EXCEPTION 'Channel not found: %', p_channel_tg_id;
  END IF;
  
  INSERT INTO channel_posts (
    channel_id, tg_message_id, text, caption,
    has_media, media_type, views_count, forwards_count,
    posted_at, stats_updated_at
  )
  VALUES (
    v_channel_id, p_message_id, p_text, p_caption,
    p_has_media, p_media_type, p_views_count, p_forwards_count,
    p_posted_at, NOW()
  )
  ON CONFLICT (channel_id, tg_message_id) DO UPDATE SET
    text = COALESCE(EXCLUDED.text, channel_posts.text),
    caption = COALESCE(EXCLUDED.caption, channel_posts.caption),
    has_media = COALESCE(EXCLUDED.has_media, channel_posts.has_media),
    media_type = COALESCE(EXCLUDED.media_type, channel_posts.media_type),
    views_count = GREATEST(EXCLUDED.views_count, channel_posts.views_count),
    forwards_count = GREATEST(EXCLUDED.forwards_count, channel_posts.forwards_count),
    stats_updated_at = NOW()
  RETURNING id INTO v_post_id;
  
  -- Update channel last_post_at
  UPDATE telegram_channels
  SET last_post_at = GREATEST(last_post_at, p_posted_at)
  WHERE id = v_channel_id;
  
  RETURN v_post_id;
END;
$$;

-- =====================================================
-- 10. RPC: ADD REACTION TO POST
-- =====================================================
CREATE OR REPLACE FUNCTION add_channel_post_reaction(
  p_channel_tg_id BIGINT,
  p_message_id BIGINT,
  p_user_id BIGINT,
  p_emoji TEXT,
  p_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_channel_id UUID;
  v_post_id UUID;
BEGIN
  -- Get channel UUID
  SELECT id INTO v_channel_id
  FROM telegram_channels
  WHERE tg_chat_id = p_channel_tg_id;
  
  IF v_channel_id IS NULL THEN
    RETURN; -- Silently ignore if channel not tracked
  END IF;
  
  -- Get or create post
  SELECT id INTO v_post_id
  FROM channel_posts
  WHERE channel_id = v_channel_id AND tg_message_id = p_message_id;
  
  IF v_post_id IS NULL THEN
    -- Create minimal post record
    INSERT INTO channel_posts (channel_id, tg_message_id, posted_at)
    VALUES (v_channel_id, p_message_id, NOW())
    RETURNING id INTO v_post_id;
  END IF;
  
  -- Add reaction
  INSERT INTO channel_post_reactions (post_id, tg_user_id, emoji)
  VALUES (v_post_id, p_user_id, p_emoji)
  ON CONFLICT (post_id, tg_user_id, emoji) DO NOTHING;
  
  -- Update post reactions count
  UPDATE channel_posts
  SET reactions_count = (
    SELECT COUNT(*) FROM channel_post_reactions WHERE post_id = v_post_id
  )
  WHERE id = v_post_id;
  
  -- Upsert subscriber record
  IF p_user_id IS NOT NULL THEN
    INSERT INTO channel_subscribers (
      channel_id, tg_user_id, username, first_name, last_name,
      reactions_count, last_activity_at
    )
    VALUES (
      v_channel_id, p_user_id, p_username, p_first_name, p_last_name,
      1, NOW()
    )
    ON CONFLICT (channel_id, tg_user_id) DO UPDATE SET
      username = COALESCE(EXCLUDED.username, channel_subscribers.username),
      first_name = COALESCE(EXCLUDED.first_name, channel_subscribers.first_name),
      last_name = COALESCE(EXCLUDED.last_name, channel_subscribers.last_name),
      reactions_count = channel_subscribers.reactions_count + 1,
      last_activity_at = NOW();
  END IF;
END;
$$;

-- =====================================================
-- 11. RPC: GET CHANNEL STATS
-- =====================================================
CREATE OR REPLACE FUNCTION get_channel_stats(
  p_channel_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE(
  total_posts BIGINT,
  total_views BIGINT,
  total_reactions BIGINT,
  total_comments BIGINT,
  total_forwards BIGINT,
  avg_views_per_post NUMERIC,
  avg_engagement_rate NUMERIC,
  active_readers BIGINT,
  subscriber_count INT,
  subscriber_growth INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
BEGIN
  v_start_date := NOW() - (p_days || ' days')::INTERVAL;
  
  RETURN QUERY
  WITH post_stats AS (
    SELECT
      COUNT(*) as posts,
      COALESCE(SUM(views_count), 0) as views,
      COALESCE(SUM(reactions_count), 0) as reactions,
      COALESCE(SUM(comments_count), 0) as comments,
      COALESCE(SUM(forwards_count), 0) as forwards,
      COALESCE(AVG(views_count), 0) as avg_views,
      COALESCE(AVG(engagement_rate), 0) as avg_engagement
    FROM channel_posts
    WHERE channel_id = p_channel_id
      AND posted_at >= v_start_date
  ),
  reader_stats AS (
    SELECT COUNT(DISTINCT tg_user_id) as active
    FROM channel_subscribers
    WHERE channel_id = p_channel_id
      AND last_activity_at >= v_start_date
  ),
  channel_info AS (
    SELECT 
      subscriber_count,
      COALESCE(
        (SELECT subscriber_change FROM channel_stats_daily 
         WHERE channel_id = p_channel_id 
         ORDER BY date DESC LIMIT 1), 
        0
      ) as growth
    FROM telegram_channels
    WHERE id = p_channel_id
  )
  SELECT
    ps.posts,
    ps.views,
    ps.reactions,
    ps.comments,
    ps.forwards,
    ROUND(ps.avg_views, 2),
    ROUND(ps.avg_engagement, 4),
    rs.active,
    ci.subscriber_count,
    ci.growth
  FROM post_stats ps, reader_stats rs, channel_info ci;
END;
$$;

-- =====================================================
-- 12. RPC: GET TOP POSTS
-- =====================================================
CREATE OR REPLACE FUNCTION get_channel_top_posts(
  p_channel_id UUID,
  p_limit INT DEFAULT 10,
  p_order_by TEXT DEFAULT 'views' -- 'views', 'engagement', 'reactions', 'recent'
)
RETURNS TABLE(
  id UUID,
  tg_message_id BIGINT,
  text TEXT,
  has_media BOOLEAN,
  media_type TEXT,
  views_count INT,
  reactions_count INT,
  comments_count INT,
  forwards_count INT,
  engagement_rate NUMERIC,
  posted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.tg_message_id,
    cp.text,
    cp.has_media,
    cp.media_type,
    cp.views_count,
    cp.reactions_count,
    cp.comments_count,
    cp.forwards_count,
    cp.engagement_rate,
    cp.posted_at
  FROM channel_posts cp
  WHERE cp.channel_id = p_channel_id
  ORDER BY
    CASE p_order_by
      WHEN 'views' THEN cp.views_count
      WHEN 'reactions' THEN cp.reactions_count
      ELSE 0
    END DESC,
    CASE p_order_by
      WHEN 'engagement' THEN cp.engagement_rate
      ELSE 0
    END DESC,
    CASE p_order_by
      WHEN 'recent' THEN EXTRACT(EPOCH FROM cp.posted_at)
      ELSE 0
    END DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 13. RPC: GET ORG CHANNELS
-- =====================================================
CREATE OR REPLACE FUNCTION get_org_channels(p_org_id UUID)
RETURNS TABLE(
  id UUID,
  tg_chat_id BIGINT,
  username TEXT,
  title TEXT,
  subscriber_count INT,
  bot_status TEXT,
  is_primary BOOLEAN,
  track_analytics BOOLEAN,
  last_post_at TIMESTAMPTZ,
  posts_count BIGINT,
  total_views BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.tg_chat_id,
    c.username,
    c.title,
    c.subscriber_count,
    c.bot_status,
    oc.is_primary,
    oc.track_analytics,
    c.last_post_at,
    (SELECT COUNT(*) FROM channel_posts WHERE channel_id = c.id) as posts_count,
    (SELECT COALESCE(SUM(views_count), 0) FROM channel_posts WHERE channel_id = c.id) as total_views
  FROM telegram_channels c
  JOIN org_telegram_channels oc ON oc.channel_id = c.id
  WHERE oc.org_id = p_org_id
  ORDER BY oc.is_primary DESC, c.title;
END;
$$;

-- =====================================================
-- 14. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE telegram_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_telegram_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_stats_daily ENABLE ROW LEVEL SECURITY;

-- Helper function to check org access to channel
CREATE OR REPLACE FUNCTION user_has_channel_access(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM org_telegram_channels oc
    JOIN memberships m ON m.org_id = oc.org_id
    WHERE oc.channel_id = p_channel_id
      AND m.user_id = auth.uid()
  );
END;
$$;

-- Policies for telegram_channels
CREATE POLICY "channels_select" ON telegram_channels
  FOR SELECT USING (user_has_channel_access(id));

-- Policies for org_telegram_channels  
CREATE POLICY "org_channels_select" ON org_telegram_channels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.org_id = org_telegram_channels.org_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org_channels_insert" ON org_telegram_channels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.org_id = org_telegram_channels.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_channels_delete" ON org_telegram_channels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.org_id = org_telegram_channels.org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

-- Policies for channel_posts
CREATE POLICY "posts_select" ON channel_posts
  FOR SELECT USING (user_has_channel_access(channel_id));

-- Policies for channel_post_reactions
CREATE POLICY "reactions_select" ON channel_post_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_posts p
      WHERE p.id = channel_post_reactions.post_id
        AND user_has_channel_access(p.channel_id)
    )
  );

-- Policies for channel_subscribers
CREATE POLICY "subscribers_select" ON channel_subscribers
  FOR SELECT USING (user_has_channel_access(channel_id));

-- Policies for channel_stats_daily
CREATE POLICY "stats_select" ON channel_stats_daily
  FOR SELECT USING (user_has_channel_access(channel_id));

-- =====================================================
-- 15. GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON telegram_channels TO authenticated;
GRANT SELECT, INSERT, DELETE ON org_telegram_channels TO authenticated;
GRANT SELECT ON channel_posts TO authenticated;
GRANT SELECT ON channel_post_reactions TO authenticated;
GRANT SELECT ON channel_subscribers TO authenticated;
GRANT SELECT ON channel_stats_daily TO authenticated;

-- Service role gets full access
GRANT ALL ON telegram_channels TO service_role;
GRANT ALL ON org_telegram_channels TO service_role;
GRANT ALL ON channel_posts TO service_role;
GRANT ALL ON channel_post_reactions TO service_role;
GRANT ALL ON channel_subscribers TO service_role;
GRANT ALL ON channel_stats_daily TO service_role;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE telegram_channels IS 'Telegram channels tracked by the system';
COMMENT ON TABLE org_telegram_channels IS 'Mapping between organizations and their channels';
COMMENT ON TABLE channel_posts IS 'Posts from tracked channels with engagement metrics';
COMMENT ON TABLE channel_post_reactions IS 'Reactions on channel posts';
COMMENT ON TABLE channel_subscribers IS 'Active subscribers identified through reactions and comments';
COMMENT ON TABLE channel_stats_daily IS 'Daily aggregated statistics for channels';
