import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ClickEventRepository } from '../../src/analytics/click-event-repository.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
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

async function createMany(app: ReturnType<typeof createApp>, n: number): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await request(app)
      .post('/api/v1/urls')
      .send({ url: `https://example.com/item-${String(i)}` });
    expect(res.status).toBe(201);
    codes.push(String(res.body.shortCode));
  }
  return codes;
}

describe('GET /api/v1/urls', () => {
  it('pages newest-first through cursor chains with no total count', async () => {
    const app = createApp();
    const created = await createMany(app, 5);
    // Two clicks on the newest link: the list must attribute per-row counts
    // (a broken correlation would repeat the table total on every row).
    const click = {
      eventType: 'url.clicked',
      shortCode: created[4],
      clickedAt: new Date().toISOString(),
      ip: null,
      userAgent: null,
      referer: null,
    } as const;
    await analytics.recordClick(click, randomUUID());
    await analytics.recordClick(click, randomUUID());

    const page1 = await request(app).get('/api/v1/urls?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    // Newest first: reverse creation order.
    expect(page1.body.items.map((i: { shortCode: string }) => i.shortCode)).toEqual([
      created[4],
      created[3],
    ]);
    expect(page1.body.items[0]).toMatchObject({ clicks: 2 });
    expect(page1.body.items[1]).toMatchObject({ clicks: 0 });
    expect(typeof page1.body.nextCursor).toBe('string');
    expect(page1.body).not.toHaveProperty('total');

    const page2 = await request(app).get(
      `/api/v1/urls?limit=2&cursor=${String(page1.body.nextCursor)}`,
    );
    expect(page2.body.items.map((i: { shortCode: string }) => i.shortCode)).toEqual([
      created[2],
      created[1],
    ]);

    const page3 = await request(app).get(
      `/api/v1/urls?limit=2&cursor=${String(page2.body.nextCursor)}`,
    );
    expect(page3.body.items.map((i: { shortCode: string }) => i.shortCode)).toEqual([created[0]]);
    expect(page3.body.nextCursor).toBeNull();
  });

  it('searches across code, destination, and alias', async () => {
    const app = createApp();
    await request(app).post('/api/v1/urls').send({ url: 'https://github.com/pricing' });
    await request(app)
      .post('/api/v1/urls')
      .send({ url: 'https://example.com/x', customAlias: 'github' });
    await request(app).post('/api/v1/urls').send({ url: 'https://example.com/unrelated' });

    const res = await request(app).get('/api/v1/urls?search=github');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);

    const empty = await request(app).get('/api/v1/urls?search=no-such-thing');
    expect(empty.body.items).toHaveLength(0);
    expect(empty.body.nextCursor).toBeNull();
  });

  it('rejects bad pagination input with 400', async () => {
    const app = createApp();
    for (const query of ['?limit=0', '?limit=101', '?cursor=garbage!!']) {
      const res = await request(app).get(`/api/v1/urls${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    }
  });

  it('matches LIKE wildcards literally', async () => {
    const app = createApp();
    await request(app).post('/api/v1/urls').send({ url: 'https://example.com/100%_coverage' });

    const res = await request(app).get('/api/v1/urls?search=100%25_coverage');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('GET /api/v1/urls/:shortCode', () => {
  it('returns details with lifetime clicks and shortUrl', async () => {
    const app = createApp();
    const created = await request(app).post('/api/v1/urls').send({ url: 'https://example.com/d' });
    const code = String(created.body.shortCode);
    await analytics.recordClick(
      {
        eventType: 'url.clicked',
        shortCode: code,
        clickedAt: new Date().toISOString(),
        ip: null,
        userAgent: null,
        referer: null,
      },
      randomUUID(),
    );

    const res = await request(app).get(`/api/v1/urls/${code}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      shortCode: code,
      shortUrl: `http://localhost:3000/${code}`,
      originalUrl: 'https://example.com/d',
      isActive: true,
      clicks: 1,
    });
  });

  it('answers 404 for unknown codes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/urls/never');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});
