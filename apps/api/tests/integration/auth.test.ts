import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp, registerFallback } from '../../src/app.js';
import { closeDb, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { closeRedis, getRedis } from '../../src/redis/client.js';
import { authedClient } from '../helpers.js';
import { waitForRedis } from '../redis-ready.js';

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

describe('authentication', () => {
  it('registers, returns the current user, and logout invalidates the token', async () => {
    const { app } = createApp();
    registerFallback(app);
    const email = `owner-${String(Date.now())}@example.com`;
    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123' });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(email);
    const token = String(registered.body.token);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ id: registered.body.user.id, email });

    const loggedOut = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(loggedOut.status).toBe(204);

    const after = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it('rejects a wrong password and an unknown email with the same 401', async () => {
    const { app } = createApp();
    registerFallback(app);
    const email = `login-${String(Date.now())}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'password123' });

    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'not-the-password' });
    const missing = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'password123' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
  });

  it('logs in with the registered password', async () => {
    const { app } = createApp();
    registerFallback(app);
    const email = `again-${String(Date.now())}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'password123' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
  });

  it('creates as guest without a session, but rejects a forged bearer', async () => {
    const { app } = createApp();
    registerFallback(app);
    const guest = await request(app).post('/api/v1/urls').send({ url: 'https://example.com' });
    expect(guest.status).toBe(201);
    expect(typeof guest.body.guestId).toBe('string');

    const forged = await request(app)
      .post('/api/v1/urls')
      .set('Authorization', 'Bearer forged-token-xyz')
      .send({ url: 'https://example.com' });
    expect(forged.status).toBe(401);
  });
});

describe('ownership', () => {
  it('hides another user\'s URL from details, delete, and analytics', async () => {
    const owner = await authedClient();
    const other = await authedClient();
    const created = await owner.api.post('/api/v1/urls').send({ url: 'https://example.com/owned' });
    expect(created.status).toBe(201);
    const code = String(created.body.shortCode);

    const details = await other.api.get(`/api/v1/urls/${code}`);
    const analytics = await other.api.get(`/api/v1/urls/${code}/analytics`);
    const deleted = await other.api.delete(`/api/v1/urls/${code}`);
    expect(details.status).toBe(404);
    expect(analytics.status).toBe(404);
    expect(deleted.status).toBe(404);

    const redirect = await request(owner.app).get(`/${code}`).redirects(0);
    expect(redirect.status).toBe(302);
    expect(redirect.headers['location']).toBe('https://example.com/owned');
  });

  it('keeps unowned legacy rows redirectable and out of every account', async () => {
    await pool.query(
      `INSERT INTO urls (short_code, original_url) VALUES ('legacy1', 'https://example.com/legacy')`,
    );
    const { api, app } = await authedClient();
    const list = await api.get('/api/v1/urls');
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);

    const removed = await api.delete('/api/v1/urls/legacy1');
    expect(removed.status).toBe(404);

    const redirect = await request(app).get('/legacy1').redirects(0);
    expect(redirect.status).toBe(302);
    expect(redirect.headers['location']).toBe('https://example.com/legacy');
    expect(JSON.stringify(redirect.body)).not.toContain('user');
  });

  it('redirects without a session', async () => {
    const { app, api } = await authedClient();
    const created = await api.post('/api/v1/urls').send({ url: 'https://example.com/public' });
    const code = String(created.body.shortCode);
    const res = await request(app).get(`/${code}`).redirects(0);
    expect(res.status).toBe(302);
  });
});
