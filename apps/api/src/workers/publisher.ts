import { recordAnalyticsEventPublished } from '../analytics/analytics-metrics.js';
import { closeDb, db, type Db } from '../db/db.js';
import { OutboxRepository } from '../outbox/outbox-repository.js';
import { assertTopology, connectRabbitMQ, EVENTS_EXCHANGE } from '../rabbitmq/connection.js';
import { env } from '../config/env.js';

const CLAIM_LIMIT = 100;
const POLL_INTERVAL_MS = 2000;
const ERROR_BACKOFF_MS = 10_000;

export interface PublishBatchResult {
  published: number;
  failed: number;
}

/**
 * Relay: outbox rows → RabbitMQ (publisher confirms) → mark published.
 * At-least-once by construction: a crash between broker-ack and marking
 * republishes a duplicate (same messageId) — the consumer (M11) dedupes.
 */
export async function publishBatchOnce(
  db: Db,
  amqpUrl: string = env.RABBITMQ_URL,
): Promise<PublishBatchResult> {
  const outbox = new OutboxRepository(db);
  const connection = await connectRabbitMQ(amqpUrl);
  try {
    const channel = await connection.createConfirmChannel();
    try {
      await assertTopology(channel);
      const claimed = await outbox.claimBatch(CLAIM_LIMIT);
      let published = 0;
      for (const row of claimed) {
        channel.publish(EVENTS_EXCHANGE, row.eventType, Buffer.from(JSON.stringify(row.payload)), {
          contentType: 'application/json',
          persistent: true,
          messageId: row.eventId,
          headers: { attempts: row.attempts },
        });
      }
      if (claimed.length > 0) {
        // Confirm = broker took responsibility (durable queue + persistent
        // message). Only then mark rows published.
        await channel.waitForConfirms();
        for (const row of claimed) {
          await outbox.markPublished(row.id);
          recordAnalyticsEventPublished();
          published += 1;
        }
      }
      return { published, failed: 0 };
    } finally {
      await channel.close();
    }
  } finally {
    await connection.close();
  }
}

/** Production loop: poll, publish, back off on errors, die never. */
export async function startPublisherLoop(db: Db): Promise<never> {
  for (;;) {
    try {
      const { published } = await publishBatchOnce(db);
      if (published === 0) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      // Broker down, DB down, anything: back off, retry forever. The outbox
      // rows wait (with growing next_attempt_at); redirects never notice.
      // Jitter breaks lockstep restarts across publisher replicas (M15:
      // no thundering herd after a shared outage clears).
      console.error(`Publisher error (retrying): ${(err as Error).message}`);
      await sleep(ERROR_BACKOFF_MS + Math.floor(Math.random() * 5000));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainModule(): boolean {
  return (
    process.argv[1]?.endsWith('publisher.js') === true ||
    process.argv[1]?.endsWith('publisher.ts') === true
  );
}

if (isMainModule()) {
  const stop = (): void => {
    console.log('Publisher shutting down...');
    void closeDb().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await startPublisherLoop(db);
}
