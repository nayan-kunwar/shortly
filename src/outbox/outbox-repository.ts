import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { ClickEvent } from '../analytics/click-event.js';
import type { Db } from '../db/db.js';
import { outboxEvents } from '../db/schema.js';

export interface OutboxRecord {
  id: number;
  eventId: string;
  eventType: string;
  payload: ClickEvent;
  attempts: number;
}

function toRecord(row: typeof outboxEvents.$inferSelect): OutboxRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: row.payload,
    attempts: row.attempts,
  };
}

/**
 * All outbox SQL lives here. Claim semantics: rows are locked
 * (FOR UPDATE SKIP LOCKED) inside a transaction and stamped with the next
 * attempt time, so N publisher instances never double-deliver and a crashed
 * publisher's rows become due again automatically.
 */
export class OutboxRepository {
  constructor(private readonly db: Db) {}

  /** Idempotent append: same event_id twice stores one row, returns it. */
  async append(
    eventType: string,
    payload: ClickEvent,
    eventId: string = randomUUID(),
  ): Promise<OutboxRecord> {
    try {
      const rows = await this.db
        .insert(outboxEvents)
        .values({ eventId, eventType, payload })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('INSERT did not return a row');
      return toRecord(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.findByEventId(eventId);
        if (existing !== null) return existing;
      }
      throw err;
    }
  }

  async findByEventId(eventId: string): Promise<OutboxRecord | null> {
    const rows = await this.db.select().from(outboxEvents).where(eq(outboxEvents.eventId, eventId));
    const row = rows[0];
    return row === undefined ? null : toRecord(row);
  }

  /** Claim up to `limit` due rows, bumping attempts with backoff. */
  async claimBatch(limit: number, now: Date = new Date()): Promise<OutboxRecord[]> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.publishedAt),
            or(isNull(outboxEvents.nextAttemptAt), lte(outboxEvents.nextAttemptAt, now)),
          ),
        )
        .orderBy(asc(outboxEvents.id))
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: OutboxRecord[] = [];
      for (const row of due) {
        const attempts = row.attempts + 1;
        // Exponential backoff: 2s, 4s, 8s… capped at 1h. Publisher crashes
        // inherit the schedule — no separate recovery pass needed.
        const backoffSeconds = Math.min(2 ** Math.min(attempts, 11), 3600);
        await tx
          .update(outboxEvents)
          .set({ attempts, nextAttemptAt: new Date(now.getTime() + backoffSeconds * 1000) })
          .where(eq(outboxEvents.id, row.id));
        claimed.push(toRecord({ ...row, attempts }));
      }
      return claimed;
    });
  }

  async markPublished(id: number): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({ publishedAt: new Date() })
      .where(eq(outboxEvents.id, id));
  }

  /** Delete published rows older than `olderThanDays`. Returns deleted count. */
  async purgePublished(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
    const rows = await this.db
      .delete(outboxEvents)
      .where(lte(outboxEvents.publishedAt, cutoff))
      .returning({ id: outboxEvents.id });
    // published_at IS NULL never satisfies lte → pending rows are safe.
    return rows.length;
  }

  async countPending(): Promise<number> {
    const rows = await this.db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt));
    return rows.length;
  }
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof current !== 'object' || current === null) return false;
    const rec = current as Record<string, unknown>;
    if (rec['code'] === '23505') return true;
    if (!('cause' in rec)) return false;
    current = rec['cause'];
  }
  return false;
}
