import http from 'node:http';
import { analyticsMetrics } from '../analytics/analytics-metrics.js';
import { recordAnalyticsEventPublished } from '../analytics/analytics-metrics.js';
import { closeDb, db, type Db } from '../db/db.js';
import { log } from '../observability/logger.js';
import { OutboxRepository } from '../outbox/outbox-repository.js';
import {
  assertTopology,
  connectRabbitMQ,
  EVENTS_EXCHANGE,
  type ChannelModel,
  type ConfirmChannel,
} from '../rabbitmq/connection.js';
import { env } from '../config/env.js';

const CLAIM_LIMIT = 100;
const POLL_INTERVAL_MS = 2000;
const ERROR_BACKOFF_MS = 10_000;
const METRICS_PORT = 9090;

export interface PublishBatchResult {
  published: number;
  failed: number;
}

/**
 * Relay: outbox rows → RabbitMQ (publisher confirms) → mark published.
 * At-least-once by construction: a crash between broker-ack and marking
 * republishes a duplicate (same messageId) — the consumer (M11) dedupes.
 *
 * Maintains a persistent connection and confirm channel. Reconnects on
 * error with exponential backoff. Batch-marks published rows.
 */
export class Publisher {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private outbox: OutboxRepository;

  constructor(private readonly db: Db) {
    this.outbox = new OutboxRepository(db);
  }

  async connect(amqpUrl: string = env.RABBITMQ_URL): Promise<void> {
    this.connection = await connectRabbitMQ(amqpUrl);
    this.channel = await this.connection.createConfirmChannel();
    await assertTopology(this.channel);
    log('info', 'Publisher connected to RabbitMQ');
  }

  async disconnect(): Promise<void> {
    if (this.channel !== null) {
      await this.channel.close().catch(() => {
        /* ignore close errors */
      });
      this.channel = null;
    }
    if (this.connection !== null) {
      await this.connection.close().catch(() => {
        /* ignore close errors */
      });
      this.connection = null;
    }
  }

  async publishBatch(): Promise<PublishBatchResult> {
    if (this.channel === null) {
      throw new Error('Publisher not connected');
    }

    const claimed = await this.outbox.claimBatch(CLAIM_LIMIT);
    if (claimed.length === 0) {
      return { published: 0, failed: 0 };
    }

    for (const row of claimed) {
      this.channel.publish(
        EVENTS_EXCHANGE,
        row.eventType,
        Buffer.from(JSON.stringify(row.payload)),
        {
          contentType: 'application/json',
          persistent: true,
          messageId: row.eventId,
          headers: { attempts: row.attempts },
        },
      );
    }

    // Confirm = broker took responsibility (durable queue + persistent
    // message). Only then batch-mark rows published.
    await this.channel.waitForConfirms();

    const ids = claimed.map((r) => r.id);
    await this.outbox.markPublishedBatch(ids);
    for (const _ of claimed) {
      recordAnalyticsEventPublished();
    }

    return { published: claimed.length, failed: 0 };
  }
}

/** Production loop: poll, publish, back off on errors, die never. */
export async function startPublisherLoop(db: Db): Promise<never> {
  const publisher = new Publisher(db);
  let connected = false;

  for (;;) {
    try {
      if (!connected) {
        await publisher.connect();
        connected = true;
      }
      const { published } = await publisher.publishBatch();
      if (published === 0) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      connected = false;
      log('error', 'Publisher error (retrying)', {
        error: (err as Error).message,
      });
      await publisher.disconnect().catch(() => {
        /* ignore disconnect errors during cleanup */
      });
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
  // Metrics HTTP endpoint for Prometheus scraping.
  const metricsServer = http.createServer((_req, res) => {
    const lines = [
      '# HELP analytics_events_published Click events confirmed by the broker.',
      '# TYPE analytics_events_published counter',
      `analytics_events_published ${String(analyticsMetrics.eventsPublished)}`,
    ];
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(lines.join('\n') + '\n');
  });
  metricsServer.listen(METRICS_PORT);

  log('info', 'Publisher starting', { metricsPort: METRICS_PORT });

  const stop = (): void => {
    log('info', 'Publisher shutting down...');
    metricsServer.close();
    void closeDb().finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await startPublisherLoop(db);
}
