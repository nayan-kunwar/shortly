-- Milestone 1: persistent URL storage.
-- PostgreSQL is the source of truth; every later layer (Redis, workers)
-- derives from this table.

-- One row per shortened URL (generated codes and custom aliases share the
-- table; a row is "generated" when custom_alias IS NULL).
CREATE TABLE IF NOT EXISTS urls (
  -- BIGSERIAL: 8-byte sequence. Gaps after rollbacks/crashes are expected
  -- and harmless (codes only need uniqueness, not contiguity).
  id BIGSERIAL PRIMARY KEY,

  -- Lookup key for GET /:shortCode. Unique constraint doubles as the index
  -- that makes the redirect-path lookup O(log n).
  short_code TEXT NOT NULL,

  -- The destination. Length guard matches the API validation (M2: 2048).
  original_url TEXT NOT NULL,

  -- NULL for generated codes, set for custom aliases (M6). UNIQUE allows
  -- many NULLs in PostgreSQL, so generated rows never conflict with each
  -- other — only two identical aliases collide.
  custom_alias TEXT,

  -- Reserved for future auth. No FK yet: there is no users table, and a FK
  -- to a nonexistent table would only block inserts.
  user_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULL means "never expires". Expiry is lazy: redirect checks this column
  -- (M4/M7); a background cleanup comes later, not a DB TTL.
  expires_at TIMESTAMPTZ,

  -- Soft-delete flag (M7). Rows are deactivated, never hard-deleted, so
  -- analytics history stays joinable.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT urls_short_code_unique UNIQUE (short_code),
  CONSTRAINT urls_custom_alias_unique UNIQUE (custom_alias),
  CONSTRAINT urls_original_url_length CHECK (
    char_length(original_url) BETWEEN 1 AND 2048
  )
);

-- Keep updated_at honest without trusting every writer to set it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_urls_updated_at ON urls;
CREATE TRIGGER trg_urls_updated_at
  BEFORE UPDATE ON urls
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
