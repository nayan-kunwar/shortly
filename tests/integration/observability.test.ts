import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetCacheMetrics } from '../../src/cache/cache-metrics.js';
import { closeDb, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import {
  httpRequestsTotal,
  redirectRequestsTotal,
  resetHttpMetrics,
  urlCreationTotal,
} from '../../src/observability/http-metrics.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { waitForRedis } from '../redis-ready.js';

// Needs real PostgreSQL + Redis + RabbitMQ (ready checks all three).

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await getRedis().flushdb();
  resetHttpMetrics();
  resetCacheMetrics();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

describe('observability', () => {
  it('tags responses with unique request ids', async () => {
    const app = createApp();
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');
    expect(first.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
  });

  it('reports ready with per-dependency checks', async () => {
    const app = createApp();
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.postgres.ok).toBe(true);
    expect(res.body.checks.redis.ok).toBe(true);
    expect(res.body.checks.rabbitmq.ok).toBe(true);
  });

  it('counts requests, creations, and redirects with route-pattern labels', async () => {
    const app = createApp();
    const created = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/m' });
    const code = String(created.body.shortCode);
    await request(app).get(`/${code}`).redirects(0);
    await request(app).get(`/${code}`).redirects(0);

    const metrics = await request(app).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.headers['content-type']).toMatch(/text\/plain/);
    const body = String(metrics.text);

    // Raw short codes must never become label values (cardinality bomb).
    expect(body).not.toContain(`path="/${code}"`);
    expect(body).toContain('path="/:shortCode"');
    expect(body).toContain('redirect_requests_total 2');
    expect(body).toContain('url_creation_total 1');
    expect(body).toContain('redirect_cache_hits 1');
    expect(body).toContain('redirect_cache_misses 1');
    expect(body).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*status="302"[^}]*\} 2/);
  });

  it('leaves the unit counters importable (sanity on wiring)', () => {
    expect(httpRequestsTotal.name).toBe('http_requests_total');
    expect(redirectRequestsTotal.name).toBe('redirect_requests_total');
    expect(urlCreationTotal.name).toBe('url_creation_total');
  });
});
