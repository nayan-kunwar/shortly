import { randomUUID } from 'node:crypto';
import type { Channel, ConsumeMessage } from 'amqplib';
import {
  recordAnalyticsEventDuplicated,
  recordAnalyticsEventFailed,
  recordAnalyticsEventProcessed,
} from '../analytics/analytics-metrics.js';
import { clickEventSchema } from '../analytics/click-event.js';
import { ClickEventRepository } from '../analytics/click-event-repository.js';
import type { Db } from '../db/db.js';
import { closeDb, db } from '../db/db.js';
import { assertTopology, CLICKS_QUEUE, connectRabbitMQ } from '../rabbitmq/connection.js';
import { env } from '../config/env.js';

const PREFETCH = 50;

export interface WorkerHandle {
  stop(): Promise<void>;
}

/**
 * Analytics consumer: validate → persist (idempotent) → ack.
 * - Unparseable/invalid payload → reject without requeue → DLQ (poison).
 * - DB/auth errors on first delivery → nack with requeue (transient);
 *   on redelivery → reject to DLQ (bounded poison handling).
 * - Crash before ack → broker redelivers; event_id dedupe keeps it exact.
 */
export async function startAnalyticsWorker(
  db: Db,
  amqpUrl: string = env.RABBITMQ_URL,
): Promise<WorkerHandle> {
  const repo = new ClickEventRepository(db);
  const connection = await connectRabbitMQ(amqpUrl);
  const channel = await connection.createChannel();
  await assertTopology(channel);
  await channel.prefetch(PREFETCH);

  await channel.consume(CLICKS_QUEUE, (msg) => {
    void handleMessage(channel, repo, msg).catch((err: unknown) => {
      console.error(`Worker handler crashed (message requeued): ${(err as Error).message}`);
    });
  });

  return {
    stop: async () => {
      await channel.close();
      await connection.close();
    },
  };
}

async function handleMessage(
  channel: Channel,
  repo: ClickEventRepository,
  msg: ConsumeMessage | null,
): Promise<void> {
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
  try {
    // Zod nullish() yields undefined; storage uses null. Normalize at the edge.
    const result = await repo.recordClick(
      {
        ...parsed.data,
        ip: parsed.data.ip ?? null,
        userAgent: parsed.data.userAgent ?? null,
        referer: parsed.data.referer ?? null,
      },
      eventId,
    );
    if (result === 'duplicate') {
      recordAnalyticsEventDuplicated();
    } else {
      recordAnalyticsEventProcessed();
    }
    channel.ack(msg);
  } catch {
    if (msg.fields.redelivered) {
      channel.reject(msg, false);
      recordAnalyticsEventFailed();
    } else {
      channel.nack(msg, false, true);
    }
  }
}

function isMainModule(): boolean {
  return (
    process.argv[1]?.endsWith('analytics-worker.js') === true ||
    process.argv[1]?.endsWith('analytics-worker.ts') === true
  );
}

if (isMainModule()) {
  const worker = await startAnalyticsWorker(db);
  console.log('Analytics worker started.');
  const stop = (): void => {
    console.log('Analytics worker shutting down...');
    void worker
      .stop()
      .catch((e: unknown) => console.error('Error stopping worker', e))
      .then(() => closeDb())
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
