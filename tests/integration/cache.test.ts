import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UrlCache } from '../../src/cache/url-cache.js';
import { cacheMetrics, resetCacheMetrics } from '../../src/cache/cache-metrics.js';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { GoneError } from '../../src/errors/gone-error.js';
import { NotFoundError } from '../../src/errors/not-found-error.js';
import { closeRedis, createRedisClient, getRedis } from '../../src/redis/client.js';
import { waitForRedis } from '../redis-ready.js';
import { UrlRepository } from '../../src/repositories/url.repository.js';
import { UrlService } from '../../src/services/url.service.js';

// Needs real PostgreSQL + Redis: docker compose up -d postgres redis && npm run db:migrate

const service = new UrlService(new UrlRepository(db), new UrlCache(getRedis()));

beforeAll(async () => {
  await runMigrations(pool);
  await waitForRedis();
}, 30_000);

beforeEach(async () => {
  // Both stores reset: PG rows AND Redis entries. Truncating only PG leaves
  // stale cache hits (e.g. an alias cached by an earlier run) that make
  // "miss" assertions fail non-deterministically.
  await pool.query('TRUNCATE urls RESTART IDENTITY');
  await getRedis().flushdb();
  resetCacheMetrics();
});

afterAll(async () => {
  await closeDb();
  await closeRedis();
});

describe('redirect cache (cache-aside)', () => {
  it('misses once, populates, then hits', async () => {
    const created = await service.createShortUrl({ url: 'https://example.com/cached' });

    const first = await service.resolveUrl(created.shortCode);
    expect(first.originalUrl).toBe('https://example.com/cached');
    expect(cacheMetrics).toMatchObject({ hits: 0, misses: 1 });

    const second = await service.resolveUrl(created.shortCode);
    expect(second.originalUrl).toBe('https://example.com/cached');
    expect(cacheMetrics).toMatchObject({ hits: 1, misses: 1 });
  });

  it('serves hits without the database', async () => {
    const created = await service.createShortUrl({ url: 'https://example.com/nodb' });
    await service.resolveUrl(created.shortCode);
    expect(cacheMetrics.misses).toBe(1);

    // The row is gone from PostgreSQL; only Redis can answer now.
    await pool.query('TRUNCATE urls');
    const hit = await service.resolveUrl(created.shortCode);
    expect(hit.originalUrl).toBe('https://example.com/nodb');
    expect(cacheMetrics.hits).toBe(1);
  });

  it('invalidates on deactivation (no stale 302)', async () => {
    const created = await service.createShortUrl({ url: 'https://example.com/byebye' });
    await service.resolveUrl(created.shortCode);
    await service.deactivateUrl(created.shortCode);

    const err = await service.resolveUrl(created.shortCode).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoneError);
    // A re-fetch happened (miss), not a stale cache hit.
    expect(cacheMetrics.misses).toBeGreaterThanOrEqual(2);
  });

  it('create invalidates a cached negative (alias after miss)', async () => {
    const miss = await service.resolveUrl('freshalias').catch((e: unknown) => e);
    expect(miss).toBeInstanceOf(NotFoundError);

    await service.createShortUrl({ url: 'https://example.com/now', customAlias: 'freshalias' });
    const found = await service.resolveUrl('freshalias');
    expect(found.originalUrl).toBe('https://example.com/now');
  });

  it('applies lazy expiry to cached rows', async () => {
    const cache = new UrlCache(getRedis());
    await cache.store('stalecached', {
      kind: 'url',
      originalUrl: 'https://example.com/stale',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      isActive: true,
    });

    const err = await service.resolveUrl('stalecached').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoneError);
    expect((err as GoneError).reason).toBe('expired');
  });

  it('falls back to PostgreSQL when Redis is down (fail-open)', async () => {
    const created = await service.createShortUrl({ url: 'https://example.com/fallback' });
    const broken = createRedisClient('redis://localhost:6399');
    try {
      const degraded = new UrlService(new UrlRepository(db), new UrlCache(broken));
      const found = await degraded.resolveUrl(created.shortCode);
      expect(found.originalUrl).toBe('https://example.com/fallback');

      const miss = await degraded.resolveUrl('never-existed').catch((e: unknown) => e);
      expect(miss).toBeInstanceOf(NotFoundError);
    } finally {
      broken.disconnect();
    }
  });
});
