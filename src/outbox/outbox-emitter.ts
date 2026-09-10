import type { ClickEmitter, ClickEvent } from '../analytics/click-event.js';
import type { OutboxRepository } from './outbox-repository.js';

/**
 * Production emitter: persists the event as an outbox row, fire-and-forget.
 * The redirect never awaits this — crash between redirect and INSERT loses
 * the event (documented M10 trade-off: redirect latency beats edge
 * durability; everything after the INSERT is reliable).
 *
 * event_id is random per emission: two clicks in the same millisecond are
 * two events. Deterministic ids (code+timestamp) would wrongly dedupe them.
 */
export class OutboxClickEmitter implements ClickEmitter {
  constructor(private readonly outbox: OutboxRepository) {}

  emit(event: ClickEvent): void {
    void this.outbox.append('url.clicked', event).catch((err: unknown) => {
      console.error(`Outbox append failed (event lost): ${(err as Error).message}`);
    });
  }
}
