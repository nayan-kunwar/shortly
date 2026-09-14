import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { ConsumeMessage } from 'amqplib';
import { Redis } from 'ioredis';
import {
  recordAnalyticsEventDuplicated,
  recordAnalyticsEventFailed,
  recordAnalyticsEventProcessed,
} from '../analytics/analytics-metrics.js';
import { analyticsMetrics } from '../analytics/analytics-metrics.js';
import { clickEventSchema, type ClickEvent } from '../analytics/click-event.js';
import { ClickEventRepository } from '../analytics/click-event-repository.js';
import type { Db } from '../db/db.js';
import { closeDb, db } from '../db/db.js';
import { log } from '../observability/logger.js';
import {
  assertTopology,
  CLICKS_QUEUE,
  connectRabbitMQ,
} from '../rabbitmq/connection.js';
import { env } from '../config/env.js';
import { createRedisClient } from '../redis/client.js';

const PREFETCH = 50;
const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 100;
const METRICS_PORT = 9091;

interface PendingMessage {
  msg: ConsumeMessage;
  parsed: ClickEvent;
  eventId: string;
}

export interface WorkerHandle {
  stop(): Promise<void>;
}

function renderWorkerMetrics(): string {
  const lines = [
    '# HELP analytics_events_processed Click events persisted by the worker.',
    '# TYPE analytics_events_processed counter',
    `analytics_events_processed ${String(analyticsMetrics.eventsProcessed)}`,
    '# HELP analytics_events_duplicated Duplicate deliveries absorbed.',
    '# TYPE analytics_events_duplicated counter',
    `analytics_events_duplicated ${String(analyticsMetrics.eventsDuplicated)}`,
    '# HELP analytics_events_failed Click events dead-lettered.',
    '# TYPE analytics_events_failed counter',
    `analytics_events_failed ${String(analyticsMetrics.eventsFailed)}`,
  ];
  return lines.join('\n') + '\n';
}

/**
 * Analytics consumer: validate → micro-batch → persist (idempotent) → ack.
 * - Unparseable/invalid payload → reject without requeue → DLQ (poison).
 * - DB/auth errors on first delivery → nack with requeue (transient);
 *   on redelivery → reject to DLQ (bounded poison handling).
 * - Crash before ack → broker redelivers; event_id dedupe keeps it exact.
 *
 * Uses micro-batching: accumulates up to BATCH_SIZE messages or
 * BATCH_TIMEOUT_MS, then issues a single multi-row INSERT. Reduces DB
 * round-trips by 10-50x compared to one INSERT per message.
 *
 * After successful DB insert, publishes click events to Redis pub/sub
 * channels for real-time SSE streaming to connected API clients.
 */
export async function startAnalyticsWorker(
  db: Db,
  amqpUrl: string = env.RABBITMQ_URL,
  redis?: Redis,
): Promise<WorkerHandle> {
  const repo = new ClickEventRepository(db);
  const connection = await connectRabbitMQ(amqpUrl);
  const channel = await connection.createChannel();
  await assertTopology(channel);
  await channel.prefetch(PREFETCH);

  // Note: DLQ messages accumulate for operator inspection / alerting.
  // Do NOT auto-ack them here — tests and monitoring need queue depth.

  const batch: PendingMessage[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushBatch = async (): Promise<void> => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (batch.length === 0) return;

    const toFlush = batch.splice(0, batch.length);
    try {
      const result = await repo.recordClickBatch(
        toFlush.map((m) => ({
          event: m.parsed,
          eventId: m.eventId,
        })),
      );
      for (const _ of Array(result.inserted)) {
        recordAnalyticsEventProcessed();
      }
      for (const _ of Array(result.duplicated)) {
        recordAnalyticsEventDuplicated();
      }

      // SSE: publish click events to Redis pub/sub for real-time streaming.
      // Fire-and-forget — if Redis is down, SSE clients miss updates but no
      // data is lost (events are already in PostgreSQL).
      if (redis !== undefined) {
        for (const m of toFlush) {
          void redis
            .publish(`analytics:click:${m.parsed.shortCode}`, JSON.stringify(m.parsed))
            .catch((err) => {
              log('warn', 'SSE publish failed', { error: (err as Error).message });
            });
        }
      }

      for (const m of toFlush) {
        channel.ack(m.msg);
      }
    } catch {
      for (const m of toFlush) {
        if (m.msg.fields.redelivered) {
          channel.reject(m.msg, false);
          recordAnalyticsEventFailed();
        } else {
          channel.nack(m.msg, false, true);
        }
      }
    }
  };

  await channel.consume(CLICKS_QUEUE, (msg) => {
    if (msg === null) return;

    let body: unknown;
    try {
      body = JSON.parse(msg.content.toString());
    } catch {
      channel.reject(msg, false);
      recordAnalyticsEventFailed();
      return;
    }

    const parsed = clickEventSchema.safeParse(body);
    if (!parsed.success) {
      channel.reject(msg, false);
      recordAnalyticsEventFailed();
      return;
    }

    const eventId =
      typeof msg.properties.messageId === 'string' ? msg.properties.messageId : randomUUID();

    batch.push({
      msg,
      parsed: {
        ...parsed.data,
        ip: parsed.data.ip ?? null,
        userAgent: parsed.data.userAgent ?? null,
        referer: parsed.data.referer ?? null,
      },
      eventId,
    });

    if (batch.length >= BATCH_SIZE) {
      void flushBatch();
    } else if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        void flushBatch();
      }, BATCH_TIMEOUT_MS);
    }
  });

  // Metrics HTTP endpoint for Prometheus scraping.
  const metricsServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(renderWorkerMetrics());
  });
  metricsServer.listen(METRICS_PORT);

  log('info', 'Analytics worker started', {
    prefetch: PREFETCH,
    batchSize: BATCH_SIZE,
    metricsPort: METRICS_PORT,
  });

  return {
    stop: async () => {
      await flushBatch();
      metricsServer.close();
      await channel.close();
      await connection.close();
    },
  };
}

function isMainModule(): boolean {
  return (
    process.argv[1]?.endsWith('analytics-worker.js') === true ||
    process.argv[1]?.endsWith('analytics-worker.ts') === true
  );
}

if (isMainModule()) {
  const redis = createRedisClient();
  const worker = await startAnalyticsWorker(db, env.RABBITMQ_URL, redis);
  const stop = (): void => {
    log('info', 'Analytics worker shutting down...');
    void worker
      .stop()
      .catch((e: unknown) => log('error', 'Error stopping worker', { error: (e as Error).message }))
      .then(() => {
        redis.disconnect();
        return closeDb();
      })
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
