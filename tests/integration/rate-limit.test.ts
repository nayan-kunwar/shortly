import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { rateLimitMetrics, resetRateLimitMetrics } from '../../src/ratelimit/rate-limit-metrics.js';
import { createRateLimiter } from '../../src/ratelimit/rate-limiter.js';
import { closeRedis, createRedisClient, getRedis } from '../../src/redis/client.js';
import { waitForRedis } from '../redis-ready.js';

// Needs real PostgreSQL + Redis: docker compose up -d postgres redis && npm run db:migrate

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await getRedis().flushdb();
  resetRateLimitMetrics();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

function tightApp() {
  return createApp({
    rateLimiter: createRateLimiter({ windowSeconds: 60, maxRequests: 2, keyPrefix: 'test' }),
  });
}

describe('rate limiting (fixed window)', () => {
  it('allows requests under the limit with quota headers', async () => {
    const app = tightApp();
    const first = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/1' });
    expect(first.status).toBe(201);
    expect(first.headers['x-ratelimit-limit']).toBe('2');
    expect(first.headers['x-ratelimit-remaining']).toBe('1');

    const second = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/2' });
    expect(second.status).toBe(201);
    expect(second.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('answers 429 with Retry-After over the limit and counts it', async () => {
    const app = tightApp();
    await request(app).post('/api/v1/urls').send({ url: 'https://example.com/1' });
    await request(app).post('/api/v1/urls').send({ url: 'https://example.com/2' });

    const blocked = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/3' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TooManyRequests');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(rateLimitMetrics.exceeded).toBeGreaterThanOrEqual(1);
  });

  it('never limits liveness (/health stays 200)', async () => {
    const app = tightApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
  });

  it('fails open when Redis is down (protection must not become outage)', async () => {
    const broken = createRedisClient('redis://localhost:6399');
    try {
      const app = createApp({
        rateLimiter: createRateLimiter({
          windowSeconds: 60,
          maxRequests: 1,
          keyPrefix: 'test-down',
          redis: broken,
        }),
      });
      const first = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/1' });
      const second = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/2' });
      // Over the limit AND Redis unreachable — both still served.
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    } finally {
      broken.disconnect();
    }
  });
});
