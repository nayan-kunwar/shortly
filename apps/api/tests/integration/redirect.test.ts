import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UrlCache } from '../../src/cache/url-cache.js';
import { ClickEventRepository } from '../../src/analytics/click-event-repository.js';
import {
  CollectingClickEmitter,
  noopClickEmitter,
  type ClickEvent,
} from '../../src/analytics/click-event.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { authedClient } from '../helpers.js';
import { waitForRedis } from '../redis-ready.js';
import { UrlRepository } from '../../src/repositories/url.repository.js';
import { UrlService } from '../../src/services/url.service.js';

// Needs real PostgreSQL + Redis: docker compose up -d postgres redis && npm run db:migrate

// Mutations go through the service (like future M7 routes will) so cache
// invalidation is exercised, not bypassed.
const service = new UrlService(
  new UrlRepository(db),
  new UrlCache(getRedis()),
  noopClickEmitter,
  new ClickEventRepository(db),
);

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

type Api = Awaited<ReturnType<typeof authedClient>>['api'];

async function createCode(api: Api, url: string): Promise<string> {
  const res = await api.post('/api/v1/urls').send({ url });
  expect(res.status).toBe(201);
  return String(res.body.shortCode);
}

describe('GET /:shortCode', () => {
  it('redirects with 302 and Location to the original URL', async () => {
    const { api } = await authedClient();
    const code = await createCode(api, 'https://example.com/landing');

    const res = await api.get(`/${code}`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://example.com/landing');
  });

  it('redirects custom aliases too', async () => {
    const { api } = await authedClient();
    const create = await api
      .post('/api/v1/urls')
      .send({ url: 'https://github.com/', customAlias: 'gh4' });
    expect(create.status).toBe(201);

    const res = await api.get('/gh4').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://github.com/');
  });

  it('answers 404 for unknown codes', async () => {
    const { api } = await authedClient();
    const res = await api.get('/doesnotexist').redirects(0);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('answers 410 for deactivated URLs', async () => {
    const { api, auth } = await authedClient();
    const code = await createCode(api, 'https://example.com/bye');
    await service.deactivateUrl(code, auth.userId);

    const res = await api.get(`/${code}`).redirects(0);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Gone');
    expect(res.body.reason).toBe('deactivated');
  });

  it('answers 410 for expired URLs', async () => {
    const { api, auth } = await authedClient();
    const code = await createCode(api, 'https://example.com/old');
    await service.updateUrl(code, { expiresAt: new Date(Date.now() - 1_000) }, auth.userId);

    const res = await api.get(`/${code}`).redirects(0);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe('expired');
  });

  it('still serves /health and API routes (registration order intact)', async () => {
    const { api } = await authedClient();
    await expect(api.get('/health')).resolves.toMatchObject({ status: 200 });
    const res = await api.post('/api/v1/urls').send({ url: 'https://example.com/order' });
    expect(res.status).toBe(201);
  });

  it('emits one sanitized url.clicked event per successful redirect', async () => {
    const emitter = new CollectingClickEmitter();
    const { api } = await authedClient({ emitter });
    const code = await createCode(api, 'https://example.com/counted');

    const res = await api
      .get(`/${code}`)
      .redirects(0)
      .set('User-Agent', 'test-agent/9.9')
      .set('Referer', 'https://from.example/page?token=secret');
    expect(res.status).toBe(302);
    expect(emitter.events).toHaveLength(1);

    const event = emitter.events[0] as ClickEvent;
    expect(event.eventType).toBe('url.clicked');
    expect(event.shortCode).toBe(code);
    expect(event.userAgent).toBe('test-agent/9.9');
    // Supertest connects from IPv4-mapped localhost → anonymized, never raw.
    expect(event.ip).toBe('127.0.0.0');
    // Query strings must not survive into analytics.
    expect(event.referer).toBe('https://from.example/page');
  });

  it('emits nothing for 404 and 410 answers', async () => {
    const emitter = new CollectingClickEmitter();
    const { api, auth } = await authedClient({ emitter });
    const code = await createCode(api, 'https://example.com/uncounted');
    await service.deactivateUrl(code, auth.userId);

    await api.get('/never-existed').redirects(0);
    await api.get(`/${code}`).redirects(0);
    expect(emitter.events).toHaveLength(0);
  });
});
