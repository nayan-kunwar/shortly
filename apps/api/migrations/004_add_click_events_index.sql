-- Milestone 24: add standalone index on clicked_at for retention purges
-- and global stats queries that filter on clicked_at without short_code.

CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at
  ON click_events (clicked_at);
