-- Migration 256: Recurring Events
-- Adds support for recurring (serial) events with parent/child pattern.
-- Parent event: is_recurring=true, parent_event_id=NULL, recurrence_rule set
-- Child events: parent_event_id = parent.id, occurrence_index = 1,2,3...
-- Registration: links to parent event_id (single reg + payment for the series)
-- Check-in: per child instance via new event_checkins table

-- Add recurring columns to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB,
  -- {"frequency": "weekly"|"biweekly"|"monthly",
  --  "day_of_week": 1-7  (1=Mon, 2=Tue, ..., 7=Sun) -- for weekly/biweekly
  --  "day_of_month": 1-31                             -- for monthly
  --  "end_date": "YYYY-MM-DD" | null                  -- null = indefinite
  -- }
  ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_index INTEGER; -- sequential number: 1, 2, 3...

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_events_parent_event_id
  ON events(parent_event_id)
  WHERE parent_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_is_recurring
  ON events(org_id, is_recurring)
  WHERE is_recurring = true;

-- Per-instance check-in tracking for recurring events
-- (registration is on parent, check-in is per instance)
CREATE TABLE IF NOT EXISTS event_checkins (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_by   UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_event_checkins_event
  ON event_checkins(event_id);

CREATE INDEX IF NOT EXISTS idx_event_checkins_participant
  ON event_checkins(participant_id);

-- Comments for documentation
COMMENT ON COLUMN events.is_recurring IS 'True for the parent template of a recurring series';
COMMENT ON COLUMN events.recurrence_rule IS 'JSONB rule: {frequency, day_of_week, day_of_month, end_date}';
COMMENT ON COLUMN events.parent_event_id IS 'Set on child instances; null on standalone and parent events';
COMMENT ON COLUMN events.occurrence_index IS 'Sequential index of this instance within its series (1-based)';
COMMENT ON TABLE event_checkins IS 'Per-instance attendance tracking for recurring events';
