import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import { urls } from '../db/schema.js';
import { ConflictError } from '../errors/conflict-error.js';
import type { CreateUrlInput, UpdateUrlPatch, UrlRecord } from '../types/url.js';

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

  async findByCustomAlias(alias: string): Promise<UrlRecord | null> {
    const rows = await this.db.select().from(urls).where(eq(urls.customAlias, alias));
    const row = rows[0];
    return row === undefined ? null : row;
  }

  /** Soft-delete: flip the flag, keep the row for analytics history. */
  async deactivate(shortCode: string): Promise<UrlRecord | null> {
    try {
      const rows = await this.db
        .update(urls)
        .set({ isActive: false })
        .where(eq(urls.shortCode, shortCode))
        .returning();
      const row = rows[0];
      return row === undefined ? null : row;
    } catch (err) {
      throw mapConstraintError(err);
    }
  }

  async update(shortCode: string, patch: UpdateUrlPatch): Promise<UrlRecord | null> {
    const set: { originalUrl?: string; expiresAt?: Date | null; isActive?: boolean } = {};
    if (patch.originalUrl !== undefined) set.originalUrl = patch.originalUrl;
    if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt;
    if (patch.isActive !== undefined) set.isActive = patch.isActive;
    if (Object.keys(set).length === 0) return this.findByShortCode(shortCode);

    try {
      const rows = await this.db
        .update(urls)
        .set(set)
        .where(eq(urls.shortCode, shortCode))
        .returning();
      const row = rows[0];
      return row === undefined ? null : row;
    } catch (err) {
      throw mapConstraintError(err);
    }
  }
}
