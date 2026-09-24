import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ClickEvent } from '../analytics/click-event.js';

/** Accounts. Mirror of `migrations/005_auth.sql`. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique('users_email_unique'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/** Guest identities for anonymous creates. Mirror of `migrations/006_guests.sql`. */
export const guests = pgTable('guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/** Opaque bearer sessions. Only the SHA-256 of the token is stored. */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique('sessions_token_hash_unique'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * TypeScript source of truth for the `urls` table. Must stay in sync with
 * `migrations/001_create_urls.sql` and `005_auth.sql` — migrations are
 * hand-written SQL (the `updated_at` trigger lives there; Drizzle cannot
 * express triggers), and this schema gives us typed queries over that shape.
 */
export const urls = pgTable(
  'urls',
  {
    // BIGSERIAL in SQL. mode:'number' parses pg's int8 strings to numbers.
    // generatedByDefaultAsIdentity() tells Drizzle the DB fills this in on
    // INSERT (true: the BIGSERIAL sequence owns the default). It only shapes
    // the insert type — migrations stay hand-written SQL.
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    shortCode: text('short_code').notNull().unique('urls_short_code_unique'),
    originalUrl: text('original_url').notNull(),
    customAlias: text('custom_alias').unique('urls_custom_alias_unique'),
    userId: uuid('user_id').references(() => users.id),
    /** Guest owner for anonymous creates. Set only while user_id IS NULL. */
    guestId: uuid('guest_id').references(() => guests.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    // Unique constraints double as the lookup indexes for the redirect hot
    // path (short_code) and alias lookups (custom_alias, M6). Named to match
    // the SQL migration so 23505 mapping stays stable.
    check('urls_original_url_length', sql`char_length(${t.originalUrl}) BETWEEN 1 AND 2048`),
    // Owner keyset lists: filter user_id, order id DESC. SQL migration uses
    // (user_id, id DESC); this index name matches that migration.
    // Claim scan: one guest's unclaimed links, newest first.
    index('idx_urls_guest_created').on(t.guestId, t.id),
    // Owner keyset lists: filter user_id, order id DESC. SQL migration uses
    // (user_id, id DESC); this index name matches that migration.
    index('idx_urls_user_created').on(t.userId, t.id),
  ],
);

/**
 * Transactional outbox (M10). TypeScript mirror of
 * `migrations/002_create_outbox.sql` — same sync-by-discipline rule as urls.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    eventId: uuid('event_id').notNull().unique('outbox_events_event_id_unique').defaultRandom(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<ClickEvent>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    // Partial index for the publisher poll: pending rows only.
    index('idx_outbox_pending')
      .on(t.id)
      .where(sql`${t.publishedAt} IS NULL`),
  ],
);

/**
 * Click event storage (M11). TypeScript mirror of
 * `migrations/003_create_click_events.sql`. Enrichment columns stay NULL
 * until parsing lands; aggregation readers arrive in M12.
 */
export const clickEvents = pgTable(
  'click_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    eventId: uuid('event_id').notNull().unique('click_events_event_id_unique'),
    shortCode: text('short_code').notNull(),
    clickedAt: timestamp('clicked_at', { withTimezone: true, mode: 'date' }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    country: text('country'),
    deviceType: text('device_type'),
    browser: text('browser'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('idx_click_events_link_time').on(t.shortCode, t.clickedAt)],
);

export const schema = { users, sessions, guests, urls, outboxEvents, clickEvents };
