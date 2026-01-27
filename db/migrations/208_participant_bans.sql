-- ============================================
-- Таблица банов участников
-- ============================================
-- Хранит информацию о забаненных участниках для определения
-- спам-скоринга при создании заявок

CREATE TABLE IF NOT EXISTS participant_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  tg_user_id BIGINT,
  tg_chat_id BIGINT,
  banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  banned_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_participant_bans_org ON participant_bans(org_id);
CREATE INDEX IF NOT EXISTS idx_participant_bans_participant ON participant_bans(participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participant_bans_tg_user ON participant_bans(tg_user_id) WHERE tg_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participant_bans_active ON participant_bans(org_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE participant_bans ENABLE ROW LEVEL SECURITY;

-- Политики
CREATE POLICY "participant_bans_select" ON participant_bans
  FOR SELECT USING (
    user_is_member_of_org(org_id)
  );

CREATE POLICY "participant_bans_insert" ON participant_bans
  FOR INSERT WITH CHECK (
    user_is_org_admin(org_id)
  );

CREATE POLICY "participant_bans_update" ON participant_bans
  FOR UPDATE USING (
    user_is_org_admin(org_id)
  );

CREATE POLICY "participant_bans_delete" ON participant_bans
  FOR DELETE USING (
    user_is_org_admin(org_id)
  );

-- Комментарий
COMMENT ON TABLE participant_bans IS 'Хранит информацию о забаненных участниках организации';
