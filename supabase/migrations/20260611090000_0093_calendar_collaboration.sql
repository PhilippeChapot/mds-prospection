-- 0093: P14.5.CalendarCollaboration
-- Ajoute: assignee_user_ids sur calendar_events + table user_calendar_visibility.

-- 1. Assignee column
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS assignee_user_ids UUID[] NOT NULL DEFAULT '{}';

-- 2. GIN index pour @> queries rapides
CREATE INDEX IF NOT EXISTS idx_calendar_events_assignee_user_ids
  ON calendar_events USING GIN (assignee_user_ids);

-- 3. Table de visibilité croisée des calendriers
CREATE TABLE IF NOT EXISTS user_calendar_visibility (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visible_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, visible_user_id),
  CONSTRAINT ucv_no_self_visibility CHECK (user_id <> visible_user_id)
);

ALTER TABLE user_calendar_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ucv_select_own" ON user_calendar_visibility
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ucv_insert_own" ON user_calendar_visibility
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ucv_delete_own" ON user_calendar_visibility
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON user_calendar_visibility TO authenticated;
