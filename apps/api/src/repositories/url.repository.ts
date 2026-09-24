import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../db/db.js';
import { clickEvents, urls } from '../db/schema.js';
import { ConflictError } from '../errors/conflict-error.js';
import type { CreateUrlInput, UpdateUrlPatch, UrlRecord } from '../types/url.js';
import { encodeCursor } from '../validators/url.validator.js';

export interface ListUrlsInput {
  limit: number;
  /** Keyset cursor: return rows with id below this (newest-first pages). */
  cursorId?: number | undefined;
  search?: string | undefined;
  /** Only this owner's rows. Unowned legacy rows are excluded. */
  userId: string;
}

export interface ListedUrl extends UrlRecord {
  clicks: number;
  topDevice: string | null;
  topBrowser: string | null;
  topCountry: string | null;
}

export interface ListUrlsResult {
  items: ListedUrl[];
  /** Opaque cursor for the next page, null when exhausted. */
  nextCursor: string | null;
}

/** Escape LIKE wildcards so search terms match literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Map an explicit column selection (list query) to a UrlRecord. */
function toRecord(row: UrlRecord): UrlRecord {
  return {
    id: row.id,
    shortCode: row.shortCode,
    originalUrl: row.originalUrl,
    customAlias: row.customAlias,
    userId: row.userId,
    guestId: row.guestId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
  };
}

/**
 * Walk the error chain looking for a Postgres unique violation (23505).
 * Needed because Drizzle wraps the driver's DatabaseError in its own
 * `Failed query` error — the pg code lives on `.cause`, not the top error.
 */
function findUniqueViolation(err: unknown): { constraint: string | undefined } | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof current !== 'object' || current === null) return null;
    const rec = current as Record<string, unknown>;
    if (rec['code'] === '23505') {
      const constraint = rec['constraint'];
      return { constraint: typeof constraint === 'string' ? constraint : undefined };
    }
    if (!('cause' in rec)) return null;
    current = rec['cause'];
  }
  return null;
}

/**
 * Translate a Postgres unique violation into a typed ConflictError.
 * Anything else is rethrown untouched — the repository maps what it knows,
 * it never swallows what it doesn't.
 */
function mapConstraintError(err: unknown): unknown {
  const violation = findUniqueViolation(err);
  if (violation !== null) {
    if (violation.constraint === 'urls_short_code_unique') {
      return new ConflictError('shortCode');
    }
    if (violation.constraint === 'urls_custom_alias_unique') {
      return new ConflictError('customAlias');
    }
    return new ConflictError('shortCode', 'URL conflicts with an existing row');
  }
  return err;
}

/**
 * All database access in the codebase lives here. Upper layers (services,
 * controllers) talk UrlRecords and ConflictErrors — never query builders,
 * SQL strings, or pg codes. Drizzle rows already come back in camelCase
 * matching UrlRecord, so there is no row-mapping layer to maintain.
 */
export class UrlRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateUrlInput): Promise<UrlRecord> {
    try {
      const rows = await this.db
        .insert(urls)
        .values({
          shortCode: input.shortCode,
          originalUrl: input.originalUrl,
          customAlias: input.customAlias,
          expiresAt: input.expiresAt,
          userId: input.userId,
          guestId: input.guestId,
        })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('INSERT did not return a row');
      return row;
    } catch (err) {
      throw mapConstraintError(err);
    }
  }

  /**
   * Insert a row and derive its short code from the generated id, in one
   * transaction. The placeholder satisfies NOT NULL and is invisible outside
   * the transaction (uncommitted rows are never readable), so there is no
   * window where a half-made row exists. Deterministic: no retry loop.
   *
   * @deprecated Use repo.create() with a randomly generated short code from
   * generateRandomCode() instead. This method is retained for backward
   * compatibility and potential future use with distributed ID generators.
   */
  async createWithGeneratedCode(
    input: Omit<CreateUrlInput, 'shortCode'>,
    encode: (id: number) => string,
  ): Promise<UrlRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(urls)
          .values({
            shortCode: `tmp-${randomUUID()}`,
            originalUrl: input.originalUrl,
            customAlias: input.customAlias,
            expiresAt: input.expiresAt,
            userId: input.userId,
            guestId: input.guestId,
          })
          .returning();
        const pending = inserted[0];
        if (pending === undefined) throw new Error('INSERT did not return a row');
        const updated = await tx
          .update(urls)
          .set({ shortCode: encode(pending.id) })
          .where(eq(urls.id, pending.id))
          .returning();
        const row = updated[0];
        if (row === undefined) throw new Error('UPDATE did not return a row');
        return row;
      });
    } catch (err) {
      throw mapConstraintError(err);
    }
  }

  async findByShortCode(shortCode: string): Promise<UrlRecord | null> {
    const rows = await this.db.select().from(urls).where(eq(urls.shortCode, shortCode));
    const row = rows[0];
    return row === undefined ? null : row;
  }

  /** Private-plane lookup. A missing code and another user's code both return null. */
  async findOwned(shortCode: string, userId: string): Promise<UrlRecord | null> {
    const rows = await this.db
      .select()
      .from(urls)
      .where(and(eq(urls.shortCode, shortCode), eq(urls.userId, userId)));
    const row = rows[0];
    return row === undefined ? null : row;
  }

  async findByCustomAlias(alias: string): Promise<UrlRecord | null> {
    const rows = await this.db.select().from(urls).where(eq(urls.customAlias, alias));
    const row = rows[0];
    return row === undefined ? null : toRecord(row);
  }

  /** Owner-scoped counters for the dashboard. */
  async countUrls(activeOnly: boolean, userId: string): Promise<number> {
    const filters = [eq(urls.userId, userId)];
    if (activeOnly) filters.push(eq(urls.isActive, true));
    const rows = await this.db
      .select({ count: count() })
      .from(urls)
      .where(and(...filters));
    return rows[0]?.count ?? 0;
  }

  /**
   * Keyset page, newest first. No COUNT(*): total counts tax every list call
   * on a growing table; the client pages until nextCursor is null.
   * Per-row click counts ride a LEFT JOIN (one query, not N+1); GROUP BY the
   * primary key covers the other columns via functional dependency.
   *
   * Mini-breakdowns (top device/browser/country) use correlated scalar
   * subqueries: one per dimension, but all evaluated in a single round-trip.
   * Each subquery counts clicks per value for the current URL's short code,
   * orders by count DESC, and LIMIT 1 returns the winner.
   */
  async listUrls(input: ListUrlsInput): Promise<ListUrlsResult> {
    const conditions = [eq(urls.userId, input.userId)];
    if (input.cursorId !== undefined) conditions.push(lt(urls.id, input.cursorId));
    if (input.search !== undefined && input.search !== '') {
      const term = `%${escapeLike(input.search)}%`;
      const matches = or(
        ilike(urls.shortCode, term),
        ilike(urls.originalUrl, term),
        ilike(urls.customAlias, term),
      );
      if (matches !== undefined) conditions.push(matches);
    }

    // Correlated scalar subquery: top value for a dimension per URL.
    // COALESCE folds NULLs into 'unknown'/'direct' so the UI never shows blank.
    const topValue = (column: PgColumn, fallback: string) =>
      sql<string>`(
        SELECT COALESCE(${column}, ${sql.raw(`'${fallback}'`)})
        FROM ${clickEvents}
        WHERE ${clickEvents.shortCode} = ${urls.shortCode}
        GROUP BY ${column}
        ORDER BY COUNT(*) DESC
        LIMIT 1
      )`;

    const rows = await this.db
      .select({
        id: urls.id,
        shortCode: urls.shortCode,
        originalUrl: urls.originalUrl,
        customAlias: urls.customAlias,
        userId: urls.userId,
        guestId: urls.guestId,
        createdAt: urls.createdAt,
        updatedAt: urls.updatedAt,
        expiresAt: urls.expiresAt,
        isActive: urls.isActive,
        clicks: count(clickEvents.id),
        topDevice: topValue(clickEvents.deviceType, 'unknown'),
        topBrowser: topValue(clickEvents.browser, 'unknown'),
        topCountry: topValue(clickEvents.country, 'unknown'),
      })
      .from(urls)
      .leftJoin(clickEvents, eq(clickEvents.shortCode, urls.shortCode))
      .where(and(...conditions))
      .groupBy(urls.id)
      .orderBy(desc(urls.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        ...toRecord(r),
        clicks: r.clicks,
        topDevice: r.topDevice,
        topBrowser: r.topBrowser,
        topCountry: r.topCountry,
      })),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.id) : null,
    };
  }

  /** Soft-delete one owner's row. Another user's code updates nothing. */
  async deactivate(shortCode: string, userId: string): Promise<UrlRecord | null> {    try {
      const rows = await this.db
        .update(urls)
        .set({ isActive: false })
        .where(and(eq(urls.shortCode, shortCode), eq(urls.userId, userId)))
        .returning();
      const row = rows[0];
      return row === undefined ? null : row;
    } catch (err) {
      throw mapConstraintError(err);
    }
  }

  async update(shortCode: string, patch: UpdateUrlPatch, userId: string): Promise<UrlRecord | null> {    const set: { originalUrl?: string; expiresAt?: Date | null; isActive?: boolean } = {};
    if (patch.originalUrl !== undefined) set.originalUrl = patch.originalUrl;
    if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt;
    if (patch.isActive !== undefined) set.isActive = patch.isActive;
    if (Object.keys(set).length === 0) return this.findOwned(shortCode, userId);

    try {
      const rows = await this.db
        .update(urls)
        .set(set)
        .where(and(eq(urls.shortCode, shortCode), eq(urls.userId, userId)))
        .returning();
      const row = rows[0];
      return row === undefined ? null : row;
    } catch (err) {
      throw mapConstraintError(err);
    }
  }

  /**
   * Move one guest's unclaimed links to an account. One atomic UPDATE:
   * the `user_id IS NULL` guard means account-owned rows (and legacy
   * pre-account rows) can never be taken over, and concurrent claims are
   * serialized by the row locks — the second claim simply matches nothing.
   * Returns the claimed short codes (empty when there is nothing to move,
   * so retries are idempotent, not errors).
   */
  async claimGuestLinks(guestId: string, userId: string): Promise<string[]> {
    const rows = await this.db
      .update(urls)
      .set({ userId, guestId: null })
      .where(and(eq(urls.guestId, guestId), sql`${urls.userId} IS NULL`))
      .returning({ shortCode: urls.shortCode });
    return rows.map((r) => r.shortCode);
  }
}
