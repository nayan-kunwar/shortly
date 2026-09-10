-- Milestone 10: transactional outbox for reliable analytics publication.
-- Rows are receipts: "this event must reach RabbitMQ". The publisher (M10)
-- relays them; nothing is lost on crash after the INSERT commits.

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,

  -- Idempotency key. A retried append with the same event_id inserts once
  -- (UNIQUE) instead of duplicating downstream.
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Routing key and discriminator (url.clicked, ...). Topic for the future.
  event_type TEXT NOT NULL,

  payload JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULL means pending. Set when the broker confirms receipt.
  published_at TIMESTAMPTZ,

  -- Delivery attempts (incremented at claim) and earliest next attempt.
  -- NULL next_attempt_at means "due now".
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,

  CONSTRAINT outbox_events_event_id_unique UNIQUE (event_id)
);

-- The publisher's poll query filters exactly this predicate: pending rows
-- first. Partial index keeps the poll O(due) instead of O(table).
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_events (id)
  WHERE published_at IS NULL;
