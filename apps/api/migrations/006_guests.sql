-- Guest identities for anonymous link creation. A guest is an opaque,
-- unguessable UUID minted on first anonymous create: no credentials, no
-- profile, just an ownership anchor so links can be claimed at signup.
--
-- Claim rule (see UrlRepository.claimGuestLinks): only rows with
-- user_id IS NULL move, so a guest identity can never take over links
-- that already belong to an account. Stale guest rows and their
-- unclaimed links are housekeeping fuel (purge scheduler), not auth state.
-- No backfill: existing rows simply have guest_id NULL.

CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE urls
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES guests (id);

-- Claim scan: all of one guest's unclaimed links, newest first.
CREATE INDEX IF NOT EXISTS idx_urls_guest_created ON urls (guest_id, id DESC);
