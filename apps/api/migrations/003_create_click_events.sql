-- Milestone 11: click event storage (written by the analytics worker).
-- Raw event rows; aggregation queries (M12) and the API (M13) read these.
-- Enrichment columns (country/device/browser) stay NULL until parsing lands.

CREATE TABLE IF NOT EXISTS click_events (
  id BIGSERIAL PRIMARY KEY,

  -- Dedupe key: the outbox event_id, carried as the AMQP messageId.
  -- At-least-once delivery replays the same id; the second insert is a no-op.
  event_id UUID NOT NULL,

  short_code TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL,

  ip TEXT,
  user_agent TEXT,
  referrer TEXT,

  country TEXT,
  device_type TEXT,
  browser TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT click_events_event_id_unique UNIQUE (event_id)
);

-- Per-link time-range reads (M13 analytics API). Leading short_code keeps
-- single-link dashboards O(link clicks); clicked_at orders/filters.
CREATE INDEX IF NOT EXISTS idx_click_events_link_time
  ON click_events (short_code, clicked_at);
