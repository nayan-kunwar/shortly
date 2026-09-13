import type { Channel, ChannelModel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildClickEvent } from '../../src/analytics/click-event.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import {
  assertTopology,
  CLICKS_DLQ,
  CLICKS_QUEUE,
  CLICKS_ROUTING_KEY,
  connectRabbitMQ,
  EVENTS_EXCHANGE,
} from '../../src/rabbitmq/connection.js';
import { closeRedis } from '../../src/redis/client.js';
import { startAnalyticsWorker, type WorkerHandle } from '../../src/workers/analytics-worker.js';
import { waitFor } from '../helpers.js';

// Needs PostgreSQL + RabbitMQ:
//   docker compose up -d postgres rabbitmq && npm run db:migrate

let connection: ChannelModel;
let channel: Channel;
let worker: WorkerHandle;

beforeAll(async () => {
  await runMigrations(pool);
  connection = await connectRabbitMQ();
  channel = await connection.createChannel();
  await assertTopology(channel);
  worker = await startAnalyticsWorker(db);
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE click_events RESTART IDENTITY');
  await channel.purgeQueue(CLICKS_QUEUE);
  await channel.purgeQueue(CLICKS_DLQ);
});

afterAll(async () => {
  await worker.stop();
  await channel.close();
  await connection.close();
  await closeDb();
  await closeRedis();
});

function publish(payload: unknown, messageId: string = randomUUID()): void {
  channel.publish(EVENTS_EXCHANGE, CLICKS_ROUTING_KEY, Buffer.from(JSON.stringify(payload)), {
    contentType: 'application/json',
    persistent: true,
    messageId,
  });
}

async function clickCount(code?: string): Promise<number> {
  const res =
    code === undefined
      ? await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM click_events')
      : await pool.query<{ count: string }>(
          'SELECT COUNT(*) AS count FROM click_events WHERE short_code = $1',
          [code],
        );
  return Number(res.rows[0]?.count ?? 0);
}

async function dlqDepth(): Promise<number> {
  const info = await channel.checkQueue(CLICKS_DLQ);
  return info.messageCount;
}

describe('analytics worker', () => {
  it('persists valid events and acks them', async () => {
    publish(
      buildClickEvent({ shortCode: 'w1', ip: '203.0.113.9', userAgent: 'w/1.0', referer: null }),
    );

    await waitFor(async () => (await clickCount()) === 1);
    const res = await pool.query<{ short_code: string; ip: string | null }>(
      'SELECT short_code, ip FROM click_events',
    );
    expect(res.rows[0]?.short_code).toBe('w1');
    expect(res.rows[0]?.ip).toBe('203.0.113.0');
  });

  it('dedupes redeliveries on messageId (exactly-once effect)', async () => {
    const messageId = randomUUID();
    const payload = buildClickEvent({ shortCode: 'w2', ip: null, userAgent: null, referer: null });
    publish(payload, messageId);
    await waitFor(async () => (await clickCount('w2')) === 1);

    publish(payload, messageId);
    await new Promise((resolve) => setTimeout(resolve, 800));
    // Scoped to our code: immune to rows other suites may leave behind.
    expect(await clickCount('w2')).toBe(1);
  });

  it('routes unparseable payloads to the DLQ, never the table', async () => {
    channel.sendToQueue(CLICKS_QUEUE, Buffer.from('this is not json'), { persistent: true });

    await waitFor(async () => (await dlqDepth()) === 1);
    expect(await clickCount()).toBe(0);
  });

  it('routes schema-invalid events to the DLQ', async () => {
    publish({ eventType: 'url.clicked', shortCode: '', clickedAt: 'yesterday' });

    await waitFor(async () => (await dlqDepth()) === 1);
    expect(await clickCount()).toBe(0);
  });
});
