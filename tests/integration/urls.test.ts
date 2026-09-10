import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { waitForRedis } from '../redis-ready.js';

// Needs real PostgreSQL + Redis: docker compose up -d postgres redis && npm run db:migrate

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await getRedis().flushdb();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

describe('POST /api/v1/urls', () => {
  it('creates a short URL and answers 201 with shortCode/shortUrl/originalUrl', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/very/long/url' });

    expect(res.status).toBe(201);
    expect(typeof res.body.shortCode).toBe('string');
    // Sequence-id → Base62: short, alphanumeric, deterministic per id.
    expect(String(res.body.shortCode)).toMatch(/^[0-9A-Za-z]{1,11}$/);
    expect(res.body.shortUrl).toBe(`http://localhost:3000/${String(res.body.shortCode)}`);
    expect(res.body.originalUrl).toBe('https://example.com/very/long/url');
  });

  it('issues a distinct code per URL (deterministic, no collisions possible)', async () => {
    const app = createApp();
    const first = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/1' });
    const second = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/2' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.shortCode).not.toBe(first.body.shortCode);
  });

  it('accepts a custom alias and future expiry', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/urls')
      .send({
        url: 'https://github.com/',
        customAlias: 'github',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.shortCode).toBe('github');
    expect(res.body.shortUrl).toBe('http://localhost:3000/github');
  });

  it('rejects non-http(s) URLs with 400', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/urls').send({ url: 'ftp://example.com/x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('rejects garbage, missing, and over-long URLs with 400', async () => {
    const app = createApp();
    for (const body of [
      { url: 'not-a-url' },
      {},
      { url: `https://example.com/${'a'.repeat(2048)}` },
    ]) {
      const res = await request(app).post('/api/v1/urls').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    }
  });

  it('rejects a past expiresAt with 400', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/urls')
      .send({
        url: 'https://example.com/x',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('answers 409 on duplicate custom alias', async () => {
    const app = createApp();
    const first = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/a', customAlias: 'taken' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/b', customAlias: 'taken' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('Conflict');
    expect(second.body.field).toBe('customAlias');
  });

  it('rejects reserved and too-short aliases with 400', async () => {
    const app = createApp();
    for (const customAlias of ['health', 'HEALTH', 'metrics', 'ab']) {
      const res = await request(app)
        .post('/api/v1/urls')
        .send({ url: 'https://example.com/x', customAlias });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    }
  });

  it('lets exactly one concurrent request win a contested alias', async () => {
    // Ten requests race the same alias. There is no check-then-insert
    // anywhere in the path — the unique constraint arbitrates, losers get
    // 23505 → 409. If application-level checking existed, two could win.
    const app = createApp();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/urls')
          .send({ url: `https://example.com/race/${String(i)}`, customAlias: 'race-alias' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
  });
});

describe('DELETE /api/v1/urls/:shortCode', () => {
  it('deactivates and the redirect becomes 410 (cache invalidated)', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/doomed' });
    expect(created.status).toBe(201);
    const code = String(created.body.shortCode);

    // Populate the cache first: without invalidation this GET would stay 302.
    const before = await request(app).get(`/${code}`).redirects(0);
    expect(before.status).toBe(302);

    const deleted = await request(app).delete(`/api/v1/urls/${code}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ shortCode: code, isActive: false });

    const after = await request(app).get(`/${code}`).redirects(0);
    expect(after.status).toBe(410);
    expect(after.body.reason).toBe('deactivated');
  });

  it('answers 404 for unknown codes', async () => {
    const app = createApp();
    const res = await request(app).delete('/api/v1/urls/never-existed');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('is idempotent: deleting twice still answers 200 and stays 410', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/twice' });
    const code = String(created.body.shortCode);

    const first = await request(app).delete(`/api/v1/urls/${code}`);
    const second = await request(app).delete(`/api/v1/urls/${code}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const redirect = await request(app).get(`/${code}`).redirects(0);
    expect(redirect.status).toBe(410);
  });
});
