import type { Db } from '../db/db.js';
import { clickEvents } from '../db/schema.js';
import type { ClickEvent } from './click-event.js';

export type RecordClickResult = 'inserted' | 'duplicate';

/**
 * Click storage writer. Insert is idempotent on event_id: at-least-once
 * redelivery (publisher crash between confirm and mark, broker redelivery
 * after worker crash) inserts once, counts once.
 */
export class ClickEventRepository {
  constructor(private readonly db: Db) {}

  async recordClick(event: ClickEvent, eventId: string): Promise<RecordClickResult> {
    const rows = await this.db
      .insert(clickEvents)
      .values({
        eventId,
        shortCode: event.shortCode,
        clickedAt: new Date(event.clickedAt),
        ip: event.ip,
        userAgent: event.userAgent,
        referrer: event.referer,
      })
      .onConflictDoNothing({ target: clickEvents.eventId })
      .returning({ id: clickEvents.id });
    return rows.length > 0 ? 'inserted' : 'duplicate';
  }
}
