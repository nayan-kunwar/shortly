import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';

// Needs a real PostgreSQL: npm run db:up && npm run db:migrate

beforeAll(async () => {
  await runMigrations(pool);
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
});

afterAll(async () => {
  await closeDb();
});

describe('POST /api/v1/urls', () => {
  it('creates a short URL and answers 201 with shortCode/shortUrl/originalUrl', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/very/long/url' });

    expect(res.status).toBe(201);
    expect(typeof res.body.shortCode).toBe('string');
    expect(res.body.shortCode).toHaveLength(7);
    expect(res.body.shortUrl).toBe(`http://localhost:3000/${String(res.body.shortCode)}`);
    expect(res.body.originalUrl).toBe('https://example.com/very/long/url');
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
});
