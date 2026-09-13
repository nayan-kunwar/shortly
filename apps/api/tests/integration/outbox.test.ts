import type { Channel, ChannelModel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { buildClickEvent } from '../../src/analytics/click-event.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { OutboxRepository } from '../../src/outbox/outbox-repository.js';
import { assertTopology, CLICKS_QUEUE, connectRabbitMQ } from '../../src/rabbitmq/connection.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { publishBatchOnce } from '../../src/workers/publisher.js';
import { waitFor } from '../helpers.js';
import { waitForRedis } from '../redis-ready.js';

// Needs PostgreSQL + Redis + RabbitMQ:
//   docker compose up -d postgres redis rabbitmq && npm run db:migrate

const outbox = new OutboxRepository(db);
let connection: ChannelModel;
let channel: Channel;

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
  connection = await connectRabbitMQ();
  channel = await connection.createChannel();
  await assertTopology(channel);
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await pool.query('TRUNCATE outbox_events RESTART IDENTITY');
  await getRedis().flushdb();
  await channel.purgeQueue(CLICKS_QUEUE);
});

afterAll(async () => {
  await channel.close();
  await connection.close();
  await closeDb();
  await closeRedis();
});

function sampleEvent(shortCode: string) {
  return buildClickEvent({
    shortCode,
    ip: '203.0.113.7',
    userAgent: 'test/1.0',
    referer: null,
  });
}

describe('outbox repository', () => {
  it('appends and claims pending rows, then marks them published', async () => {
    await outbox.append('url.clicked', sampleEvent('a1'));
    expect(await outbox.countPending()).toBe(1);

    const claimed = await outbox.claimBatch(10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.payload.shortCode).toBe('a1');

    // Claimed but unpublished rows are not due again (backoff scheduled).
    expect(await outbox.claimBatch(10)).toHaveLength(0);

    await outbox.markPublished(claimed[0]?.id as number);
    expect(await outbox.countPending()).toBe(0);
  });

  it('appends idempotently on duplicate event_id', async () => {
    const eventId = randomUUID();
    const first = await outbox.append('url.clicked', sampleEvent('a1'), eventId);
    const second = await outbox.append('url.clicked', sampleEvent('a1'), eventId);
    expect(second.id).toBe(first.id);
    expect(await outbox.countPending()).toBe(1);
  });

  it('purges only old published rows', async () => {
    const row = await outbox.append('url.clicked', sampleEvent('a1'));
    await outbox.markPublished(row.id);
    await outbox.append('url.clicked', sampleEvent('a2'));

    // Freshly published row is newer than the 30-day cutoff: survives.
    expect(await outbox.purgePublished(30)).toBe(0);
    // Zero-day cutoff deletes every published row, never pending ones.
    expect(await outbox.purgePublished(0)).toBe(1);
    expect(await outbox.countPending()).toBe(1);
  });
});

describe('outbox emitter wiring', () => {
  it('persists an outbox row on redirect (fire-and-forget)', async () => {
    const app = createApp();
    const created = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/e' });
    const code = String(created.body.shortCode);

    await request(app).get(`/${code}`).redirects(0);
    await waitFor(async () => (await outbox.countPending()) === 1);
  });
});

describe('publisher worker', () => {
  it('relays claimed rows to RabbitMQ with confirms, then marks published', async () => {
    await outbox.append('url.clicked', sampleEvent('p1'));
    await outbox.append('url.clicked', sampleEvent('p2'));

    const result = await publishBatchOnce(db);
    expect(result).toEqual({ published: 2, failed: 0 });
    expect(await outbox.countPending()).toBe(0);

    const first = await channel.get(CLICKS_QUEUE, { noAck: true });
    expect(first).not.toBe(false);
    if (first !== false) {
      expect(first.properties.messageId).toBeDefined();
      expect(first.properties.contentType).toBe('application/json');
      const payload = JSON.parse(first.content.toString()) as { shortCode: string };
      expect(payload.shortCode).toBe('p1');
    }

    // Nothing left to publish.
    const again = await publishBatchOnce(db);
    expect(again).toEqual({ published: 0, failed: 0 });
  });

  it('rejects (does not hang) when the broker is unreachable', async () => {
    await outbox.append('url.clicked', sampleEvent('q1'));
    await expect(publishBatchOnce(db, 'amqp://guest:guest@localhost:5699')).rejects.toThrow();
    // The row is still pending for the next attempt.
    expect(await outbox.countPending()).toBe(1);
  });
});
