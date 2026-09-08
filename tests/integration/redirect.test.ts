import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { UrlRepository } from '../../src/repositories/url.repository.js';

// Needs a real PostgreSQL: npm run db:up && npm run db:migrate

const repo = new UrlRepository(db);

beforeAll(async () => {
  await runMigrations(pool);
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls RESTART IDENTITY');
});

afterAll(async () => {
  await closeDb();
});

async function createCode(app: ReturnType<typeof createApp>, url: string): Promise<string> {
  const res = await request(app).post('/api/v1/urls').send({ url });
  expect(res.status).toBe(201);
  return String(res.body.shortCode);
}

describe('GET /:shortCode', () => {
  it('redirects with 302 and Location to the original URL', async () => {
    const app = createApp();
    const code = await createCode(app, 'https://example.com/landing');

    const res = await request(app).get(`/${code}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://example.com/landing');
  });

  it('redirects custom aliases too', async () => {
    const app = createApp();
    const create = await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://github.com/', customAlias: 'gh4' });
    expect(create.status).toBe(201);

    const res = await request(app).get('/gh4').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://github.com/');
  });

  it('answers 404 for unknown codes', async () => {
    const app = createApp();
    const res = await request(app).get('/doesnotexist').redirects(0);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('answers 410 for deactivated URLs', async () => {
    const app = createApp();
    const code = await createCode(app, 'https://example.com/bye');
    await repo.deactivate(code);

    const res = await request(app).get(`/${code}`).redirects(0);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Gone');
    expect(res.body.reason).toBe('deactivated');
  });

  it('answers 410 for expired URLs', async () => {
    const app = createApp();
    const code = await createCode(app, 'https://example.com/old');
    await repo.update(code, { expiresAt: new Date(Date.now() - 1_000) });

    const res = await request(app).get(`/${code}`).redirects(0);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('expired');
  });

  it('still serves /health and API routes (registration order intact)', async () => {
    const app = createApp();
    await expect(request(app).get('/health')).resolves.toMatchObject({ status: 200 });
    const res = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/order' });
    expect(res.status).toBe(201);
  });
});
