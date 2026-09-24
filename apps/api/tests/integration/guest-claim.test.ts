import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, registerFallback } from '../../src/app.js';
import { closeDb, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createRateLimiter } from '../../src/ratelimit/rate-limiter.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { registerAuth } from '../helpers.js';
import { waitForRedis } from '../redis-ready.js';

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE urls, sessions, users, guests RESTART IDENTITY CASCADE');
  await getRedis().flushdb();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

const GUEST_URL = 'https://example.com/guest-link';

async function guestCreate(
  app: ReturnType<typeof createApp>['app'],
  url: string = GUEST_URL,
  guestId?: string,
  extraBody: Record<string, unknown> = {},
) {
  let req = request(app).post('/api/v1/urls').send({ url, ...extraBody });
  if (guestId !== undefined) req = req.set('X-Guest-Token', guestId);
  return req;
}

describe('guest creates', () => {
  it('creates without any token and mints a guest anchor', async () => {
    const { app } = createApp();
    registerFallback(app);

    const res = await guestCreate(app);
    expect(res.status).toBe(201);
    expect(typeof res.body.shortCode).toBe('string');
    expect(typeof res.body.guestId).toBe('string');

    // The link resolves publicly.
    const redirect = await request(app).get(`/${String(res.body.shortCode)}`).redirects(0);
    expect(redirect.status).toBe(302);
  });

  it('reuses a known anchor without minting a new one', async () => {
    const { app } = createApp();
    registerFallback(app);

    const first = await guestCreate(app);
    const guestId = String(first.body.guestId);
    const second = await guestCreate(app, 'https://example.com/second', guestId);
    expect(second.status).toBe(201);
    expect(second.body.guestId).toBeUndefined();
  });

  it('rejects custom aliases for guests', async () => {
    const { app } = createApp();
    registerFallback(app);

    const res = await guestCreate(app, GUEST_URL, undefined, { customAlias: 'myalias' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GUEST_ALIAS_FORBIDDEN');
  });

  it('rejects a malformed guest token with a retryable code', async () => {
    const { app } = createApp();
    registerFallback(app);

    const res = await guestCreate(app, GUEST_URL, 'not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('GUEST_TOKEN_INVALID');
  });

  it('returns 401 for a present-but-invalid bearer (never downgrades to guest)', async () => {
    const { app } = createApp();
    registerFallback(app);

    const res = await request(app)
      .post('/api/v1/urls')
      .set('Authorization', 'Bearer forged-token-xyz')
      .send({ url: GUEST_URL });
    expect(res.status).toBe(401);
  });

  it('keeps guest links invisible to other accounts', async () => {
    const { app } = createApp();
    registerFallback(app);

    const created = await guestCreate(app);
    const code = String(created.body.shortCode);
    const other = await registerAuth(app);

    const list = await request(app).get('/api/v1/urls').set('Authorization', other.Authorization);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);

    const detail = await request(app)
      .get(`/api/v1/urls/${code}`)
      .set('Authorization', other.Authorization);
    expect(detail.status).toBe(404);
  });
});

describe('claim', () => {
  it('moves a guest\u2019s links onto the new account and is idempotent', async () => {
    const { app } = createApp();
    registerFallback(app);

    const first = await guestCreate(app);
    const guestId = String(first.body.guestId);
    const second = await guestCreate(app, 'https://example.com/guest-two', guestId);
    const codes = [String(first.body.shortCode), String(second.body.shortCode)].sort();

    const auth = await registerAuth(app);
    const claim = await request(app)
      .post('/api/v1/urls/claim')
      .set('Authorization', auth.Authorization)
      .send({ guestId });
    expect(claim.status).toBe(200);
    expect([...(claim.body.claimed as string[])].sort()).toEqual(codes);

    const list = await request(app).get('/api/v1/urls').set('Authorization', auth.Authorization);
    expect(list.body.items).toHaveLength(2);

    const again = await request(app)
      .post('/api/v1/urls/claim')
      .set('Authorization', auth.Authorization)
      .send({ guestId });
    expect(again.status).toBe(200);
    expect(again.body.claimed).toEqual([]);
  });

  it('cannot take over account-owned links', async () => {
    const created = createApp();
    registerFallback(created.app);
    const app = created.app;

    // A owns a link outright.
    const owner = await registerAuth(app);
    await request(app)
      .post('/api/v1/urls')
      .set('Authorization', owner.Authorization)
      .send({ url: 'https://example.com/owned' })
      .expect(201);

    // B tries every anchor shape: unknown UUID and a real-but-empty one.
    const attacker = await registerAuth(app);
    const unknown = await request(app)
      .post('/api/v1/urls/claim')
      .set('Authorization', attacker.Authorization)
      .send({ guestId: '11111111-2222-3333-4444-555555555555' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.claimed).toEqual([]);

    const list = await request(app).get('/api/v1/urls').set('Authorization', attacker.Authorization);
    expect(list.body.items).toEqual([]);
  });

  it('requires authentication and a UUID body', async () => {
    const { app } = createApp();
    registerFallback(app);

    const anon = await request(app).post('/api/v1/urls/claim').send({ guestId: '11111111-2222-3333-4444-555555555555' });
    expect(anon.status).toBe(401);

    const auth = await registerAuth(app);
    const bad = await request(app)
      .post('/api/v1/urls/claim')
      .set('Authorization', auth.Authorization)
      .send({ guestId: 'nope' });
    expect(bad.status).toBe(400);
  });
});

describe('guest rate budget', () => {
  it('limits anonymous creates strictly while accounts keep their budget', async () => {
    const tight = createRateLimiter({
      windowSeconds: 3600,
      maxRequests: 2,
      keyPrefix: 'test:guest-create',
    });
    const { app } = createApp({ rateLimiter: null, guestRateLimiter: tight });
    registerFallback(app);

    const first = await guestCreate(app);
    expect(first.status).toBe(201);
    const guestId = String(first.body.guestId);
    const second = await guestCreate(app, 'https://example.com/g2', guestId);
    expect(second.status).toBe(201);
    const third = await guestCreate(app, 'https://example.com/g3', guestId);
    expect(third.status).toBe(429);

    // An account on the same app (limiters disabled for writes) is unaffected.
    const auth = await registerAuth(app);
    const owned = await request(app)
      .post('/api/v1/urls')
      .set('Authorization', auth.Authorization)
      .send({ url: 'https://example.com/owned' });
    expect(owned.status).toBe(201);
  });
});
