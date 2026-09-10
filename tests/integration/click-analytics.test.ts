import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClickEventRepository } from '../../src/analytics/click-event-repository.js';
import type { ClickEvent } from '../../src/analytics/click-event.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { closeRedis } from '../../src/redis/client.js';

// Needs PostgreSQL: npm run db:up && npm run db:migrate

const repo = new ClickEventRepository(db);

beforeAll(async () => {
  await runMigrations(pool);
}, 30_000);

beforeEach(async () => {
  await pool.query('TRUNCATE click_events RESTART IDENTITY');
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

function event(shortCode: string, clickedAt: string): ClickEvent {
  return {
    eventType: 'url.clicked',
    shortCode,
    clickedAt,
    ip: '203.0.113.0',
    userAgent: 'test/1.0',
    referer: 'https://from.example/page',
  };
}

describe('click analytics storage', () => {
  it('aggregates totals, days, and dimensions with null fallbacks', async () => {
    await repo.recordClick(event('s1', '2026-03-01T10:00:00.000Z'), randomUUID(), {
      country: 'IN',
      deviceType: 'mobile',
      browser: 'Chrome',
    });
    await repo.recordClick(event('s1', '2026-03-01T12:00:00.000Z'), randomUUID(), {
      country: 'IN',
      deviceType: 'desktop',
      browser: 'Firefox',
    });
    await repo.recordClick(event('s1', '2026-03-02T10:00:00.000Z'), randomUUID());
    await repo.recordClick(event('other', '2026-03-01T10:00:00.000Z'), randomUUID(), {
      country: 'US',
    });

    const stats = await repo.getStats('s1');
    expect(stats.totalClicks).toBe(3);
    expect(stats.clicksByDay).toEqual([
      { date: '2026-03-01', count: 2 },
      { date: '2026-03-02', count: 1 },
    ]);
    expect(stats.countries).toMatchObject({ IN: 2, unknown: 1 });
    expect(stats.devices).toMatchObject({ mobile: 1, desktop: 1, unknown: 1 });
    expect(stats.browsers).toMatchObject({ Chrome: 1, Firefox: 1, unknown: 1 });
    // Referer is always set by the builder here; nulls fold to 'direct'.
    expect(stats.referrers).toMatchObject({ 'https://from.example/page': 3 });
  });

  it('returns empty stats for unknown codes', async () => {
    const stats = await repo.getStats('never');
    expect(stats).toEqual({
      totalClicks: 0,
      clicksByDay: [],
      countries: {},
      devices: {},
      browsers: {},
      referrers: {},
    });
  });

  it('purges only rows older than the retention cutoff', async () => {
    const old = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString();
    const fresh = new Date().toISOString();
    await repo.recordClick(event('s1', old), randomUUID());
    await repo.recordClick(event('s1', fresh), randomUUID());

    expect(await repo.purgeClicksOlderThan(90)).toBe(1);
    expect((await repo.getStats('s1')).totalClicks).toBe(1);
  });
});
