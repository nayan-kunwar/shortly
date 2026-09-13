import { count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../db/db.js';
import { clickEvents } from '../db/schema.js';
import type { ClickEvent } from './click-event.js';

export type RecordClickResult = 'inserted' | 'duplicate';

/** Raw click rows live 90 days; aggregates are timeless (retention policy). */
export const RAW_CLICK_RETENTION_DAYS = 90;

export interface ClickEnrichment {
  country?: string | null | undefined;
  deviceType?: string | null | undefined;
  browser?: string | null | undefined;
}

export interface DayBucket {
  date: string;
  count: number;
}

export interface ClickStats {
  totalClicks: number;
  clicksByDay: DayBucket[];
  countries: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Record<string, number>;
}

/**
 * Click storage: idempotent writer (M11) + aggregation readers (M12).
 * Insert is idempotent on event_id: at-least-once redelivery (publisher
 * crash between confirm and mark, broker redelivery after worker crash)
 * inserts once, counts once.
 */
export class ClickEventRepository {
  constructor(private readonly db: Db) {}

  async recordClick(
    event: ClickEvent,
    eventId: string,
    enrichment: ClickEnrichment = {},
  ): Promise<RecordClickResult> {
    const rows = await this.db
      .insert(clickEvents)
      .values({
        eventId,
        shortCode: event.shortCode,
        clickedAt: new Date(event.clickedAt),
        ip: event.ip,
        userAgent: event.userAgent,
        referrer: event.referer,
        country: enrichment.country ?? null,
        deviceType: enrichment.deviceType ?? null,
        browser: enrichment.browser ?? null,
      })
      .onConflictDoNothing({ target: clickEvents.eventId })
      .returning({ id: clickEvents.id });
    return rows.length > 0 ? 'inserted' : 'duplicate';
  }

  /**
   * One dashboard read. Six small indexed queries, not one mega-query:
   * each GROUP BY rides idx_click_events_link_time, and the set is easy
   * to cache per-query later (M14) instead of invalidating one blob.
   */
  async getStats(shortCode: string): Promise<ClickStats> {
    const base = eq(clickEvents.shortCode, shortCode);
    // One expression object reused in SELECT/GROUP BY/ORDER BY: Postgres
    // requires the grouped expression to match the selected one textually.
    const dayBucket = sql<string>`to_char(date_trunc('day', ${clickEvents.clickedAt}), 'YYYY-MM-DD')`;
    const [totalRows, dayRows, countries, devices, browsers, referrers] = await Promise.all([
      this.db.select({ count: count() }).from(clickEvents).where(base),
      this.db
        .select({ date: dayBucket, count: count() })
        .from(clickEvents)
        .where(base)
        .groupBy(dayBucket)
        .orderBy(dayBucket),
      this.groupBy(shortCode, clickEvents.country, 'unknown'),
      this.groupBy(shortCode, clickEvents.deviceType, 'unknown'),
      this.groupBy(shortCode, clickEvents.browser, 'unknown'),
      this.groupBy(shortCode, clickEvents.referrer, 'direct'),
    ]);
    return {
      totalClicks: totalRows[0]?.count ?? 0,
      clicksByDay: dayRows.map((r) => ({ date: r.date, count: r.count })),
      countries,
      devices,
      browsers,
      referrers,
    };
  }

  /** GROUP BY one nullable column, folding NULL into `fallback`. */
  private async groupBy(
    shortCode: string,
    column: PgColumn,
    fallback: string,
  ): Promise<Record<string, number>> {
    // The fallback is inlined as a literal (never a $param): Drizzle assigns
    // fresh placeholders per interpolation site ($1 vs $3), which Postgres
    // reads as different GROUP BY expressions. Safe because `fallback` is a
    // code constant, never user input.
    const bucket = sql<string>`COALESCE(${column}, ${sql.raw(`'${fallback}'`)})`;
    const rows = await this.db
      .select({ key: bucket, count: count() })
      .from(clickEvents)
      .where(eq(clickEvents.shortCode, shortCode))
      .groupBy(bucket)
      .orderBy(desc(count()));
    const out: Record<string, number> = {};
    for (const row of rows) out[row.key] = row.count;
    return out;
  }

  /** Retention: delete raw rows older than `olderThanDays`. Returns count. */
  async purgeClicksOlderThan(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
    const rows = await this.db
      .delete(clickEvents)
      .where(lte(clickEvents.clickedAt, cutoff))
      .returning({ id: clickEvents.id });
    return rows.length;
  }

  /** Lifetime click total for one link (detail pages). */
  async countByShortCode(shortCode: string): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(clickEvents)
      .where(eq(clickEvents.shortCode, shortCode));
    return rows[0]?.count ?? 0;
  }

  /** Global click total, optionally since a timestamp (dashboard "today"). */
  async countAll(since?: Date | undefined): Promise<number> {
    const rows = await this.db
      .select({ count: count() })
      .from(clickEvents)
      .where(since !== undefined ? gte(clickEvents.clickedAt, since) : undefined);
    return rows[0]?.count ?? 0;
  }
}
