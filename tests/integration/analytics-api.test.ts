import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ClickEventRepository } from '../../src/analytics/click-event-repository.js';
import type { ClickEvent } from '../../src/analytics/click-event.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createRateLimiter } from '../../src/ratelimit/rate-limiter.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { waitForRedis } from '../redis-ready.js';

// Needs real PostgreSQL + Redis: docker compose up -d postgres redis && npm run db:migrate

const analytics = new ClickEventRepository(db);

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

function click(shortCode: string, clickedAt: string): ClickEvent {
  return {
    eventType: 'url.clicked',
    shortCode,
    clickedAt,
    ip: '203.0.113.0',
    userAgent: 'test/1.0',
    referer: null,
  };
}

async function seed(code: string): Promise<void> {
  await analytics.recordClick(click(code, '2026-04-01T10:00:00.000Z'), randomUUID(), {
    country: 'IN',
    deviceType: 'mobile',
    browser: 'Chrome',
  });
  await analytics.recordClick(click(code, '2026-04-02T10:00:00.000Z'), randomUUID(), {
    country: 'US',
    deviceType: 'desktop',
    browser: 'Firefox',
  });
}

describe('GET /api/v1/urls/:shortCode/analytics', () => {
  it('returns the dashboard payload for a known code', async () => {
    const app = createApp();
    const created = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/a' });
    const code = String(created.body.shortCode);
    await seed(code);

    const res = await request(app).get(`/api/v1/urls/${code}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.shortCode).toBe(code);
    expect(res.body.totalClicks).toBe(2);
    expect(res.body.clicksByDay).toEqual([
      { date: '2026-04-01', count: 1 },
      { date: '2026-04-02', count: 1 },
    ]);
    expect(res.body.countries).toMatchObject({ IN: 1, US: 1 });
    expect(res.body.devices).toMatchObject({ mobile: 1, desktop: 1 });
  });

  it('answers 404 for unknown codes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/urls/never/analytics');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('uses a separate rate-limit namespace from writes', async () => {
    const app = createApp({
      rateLimiter: createRateLimiter({
        windowSeconds: 60,
        maxRequests: 1,
        keyPrefix: 'test-write',
      }),
    });
    const created = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/a' });
    expect(created.status).toBe(201);
    const code = String(created.body.shortCode);

    // Write budget exhausted…
    const blocked = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/b' });
    expect(blocked.status).toBe(429);

    // …but analytics reads flow on their own budget.
    const res = await request(app).get(`/api/v1/urls/${code}/analytics`);
    expect(res.status).toBe(200);
  });
});
