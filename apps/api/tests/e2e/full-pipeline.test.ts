import type { Channel, ChannelModel } from 'amqplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { OutboxRepository } from '../../src/outbox/outbox-repository.js';
import { assertTopology, CLICKS_QUEUE, connectRabbitMQ } from '../../src/rabbitmq/connection.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { publishBatchOnce } from '../../src/workers/publisher.js';
import { startAnalyticsWorker, type WorkerHandle } from '../../src/workers/analytics-worker.js';
import { waitFor } from '../helpers.js';
import { waitForRedis } from '../redis-ready.js';

// The whole system in one test: HTTP → PG → outbox → broker → worker → analytics.
// Needs PostgreSQL + Redis + RabbitMQ.

const outbox = new OutboxRepository(db);
let connection: ChannelModel;
let channel: Channel;
let worker: WorkerHandle;

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
  connection = await connectRabbitMQ();
  channel = await connection.createChannel();
  await assertTopology(channel);
  worker = await startAnalyticsWorker(db);
}, 60_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await pool.query('TRUNCATE outbox_events RESTART IDENTITY');
  await pool.query('TRUNCATE click_events RESTART IDENTITY');
  await getRedis().flushdb();
  await channel.purgeQueue(CLICKS_QUEUE);
});

afterAll(async () => {
  await worker.stop();
  await channel.close();
  await connection.close();
  await closeDb();
  await closeRedis();
});

async function clickCount(code: string): Promise<number> {
  const res = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM click_events WHERE short_code = $1',
    [code],
  );
  return Number(res.rows[0]?.count ?? 0);
}

describe('full pipeline e2e', () => {
  it('create → redirect → outbox → publish → consume → analytics API', async () => {
    const app = createApp();

    // 1. Create through the API (validates + persists + invalidates).
    const created = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/e2e-pipeline' });
    expect(created.status).toBe(201);
    const code = String(created.body.shortCode);

    // 2. Redirect resolves (and emits the click event fire-and-forget).
    const redirect = await request(app).get(`/${code}`).redirects(0);
    expect(redirect.status).toBe(302);

    // 3. Outbox received the event without blocking the redirect.
    await waitFor(async () => (await outbox.countPending()) === 1);

    // 4. Publisher relays to the broker with confirms.
    const batch = await publishBatchOnce(db);
    expect(batch.published).toBe(1);
    expect(await outbox.countPending()).toBe(0);

    // 5. Worker persists the click (idempotent consumer).
    await waitFor(async () => (await clickCount(code)) === 1);

    // 6. Analytics API serves it; metrics observed the redirect.
    const analytics = await request(app).get(`/api/v1/urls/${code}/analytics`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.totalClicks).toBe(1);

    const metrics = await request(app).get('/metrics');
    expect(metrics.text).toContain('redirect_requests_total 1');
  }, 60_000);
});
