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

/**
 * TypeScript source of truth for the `urls` table. Must stay in sync with
 * `migrations/001_create_urls.sql` — migrations are hand-written SQL (the
 * `updated_at` trigger lives there; Drizzle cannot express triggers), and
 * this schema gives us typed queries over that SQL-managed shape.
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
    userId: text('user_id'),
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

export const schema = { urls, outboxEvents };
