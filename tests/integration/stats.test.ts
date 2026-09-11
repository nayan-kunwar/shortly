import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ClickEventRepository } from '../../src/analytics/click-event-repository.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { UrlRepository } from '../../src/repositories/url.repository.js';
import { waitForRedis } from '../redis-ready.js';

// Needs real PostgreSQL + Redis: docker compose up -d postgres redis && npm run db:migrate

const analytics = new ClickEventRepository(db);
const urls = new UrlRepository(db);

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await pool.query('TRUNCATE click_events RESTART IDENTITY');
  await getRedis().flushdb();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

describe('GET /api/v1/stats', () => {
  it('returns global totals with UTC-day today boundary', async () => {
    const app = createApp();
    const first = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/1' });
    await request(app).post('/api/v1/urls').send({ url: 'https://example.com/2' });
    await urls.deactivate(String(first.body.shortCode));

    const fresh = new Date().toISOString();
    const old = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const click = {
      eventType: 'url.clicked',
      shortCode: 'x',
      clickedAt: fresh,
      ip: null,
      userAgent: null,
      referer: null,
    } as const;
    await analytics.recordClick({ ...click }, randomUUID());
    await analytics.recordClick({ ...click, clickedAt: fresh }, randomUUID());
    await analytics.recordClick({ ...click, clickedAt: old }, randomUUID());

    const res = await request(app).get('/api/v1/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalUrls: 2,
      activeUrls: 1,
      totalClicks: 3,
    });
    // "Today" is UTC-day bounded: fresh clicks count, the 2-day-old one doesn't.
    expect(res.body.clicksToday).toBe(2);
  });

  it('returns zeros on an empty database', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalUrls: 0, activeUrls: 0, totalClicks: 0, clicksToday: 0 });
  });
});
