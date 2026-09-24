-- Accounts and bearer sessions. PostgreSQL stays the source of truth for
-- identity so Redis is not required to log in or to reject a revoked token.
--
-- Existing urls.user_id values are NULL (the column was reserved and never
-- written). Those rows stay NULL: they keep redirecting and cannot be
-- managed by any account. No backfill.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id),
  -- SHA-256 of the bearer token. The raw token is returned once and never stored.
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);

-- TEXT -> UUID is valid while every value is NULL.
ALTER TABLE urls
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

ALTER TABLE urls
  DROP CONSTRAINT IF EXISTS urls_user_id_fkey;

ALTER TABLE urls
  ADD CONSTRAINT urls_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users (id);

-- Owner list is keyset on id, filtered by user. One index serves both.
CREATE INDEX IF NOT EXISTS idx_urls_user_created ON urls (user_id, id DESC);
