import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db, pool } from '../../src/db/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { ConflictError } from '../../src/errors/conflict-error.js';
import { UrlRepository } from '../../src/repositories/url.repository.js';

// These tests need a real PostgreSQL. Start it first:
//   npm run db:up && npm run db:migrate
// (CI runs the same two commands before `npm test`.)

let repo: UrlRepository;

beforeAll(async () => {
  await runMigrations(pool);
  repo = new UrlRepository(db);
}, 30_000);

beforeEach(async () => {
  // TRUNCATE (not DELETE) + restart the sequence: every test starts from a
  // known-empty table, and ids stay small and readable while debugging.
  await pool.query('TRUNCATE urls RESTART IDENTITY');
});

afterAll(async () => {
  await closeDb();
});

describe('UrlRepository', () => {
  it('creates a row and finds it by short code', async () => {
    const created = await repo.create({
      shortCode: 'abc123',
      originalUrl: 'https://example.com/very/long/url',
      customAlias: null,
      expiresAt: null,
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.shortCode).toBe('abc123');
    expect(created.isActive).toBe(true);
    expect(created.expiresAt).toBeNull();

    const found = await repo.findByShortCode('abc123');
    expect(found).toMatchObject({
      shortCode: 'abc123',
      originalUrl: 'https://example.com/very/long/url',
    });
  });

  it('returns null for an unknown short code', async () => {
    await expect(repo.findByShortCode('nope00')).resolves.toBeNull();
  });

  it('rejects a duplicate short_code with ConflictError', async () => {
    await repo.create({
      shortCode: 'dup001',
      originalUrl: 'https://example.com/a',
      customAlias: null,
      expiresAt: null,
    });

    const err = await repo
      .create({
        shortCode: 'dup001',
        originalUrl: 'https://example.com/b',
        customAlias: null,
        expiresAt: null,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).field).toBe('shortCode');
  });

  it('rejects a duplicate custom alias with ConflictError', async () => {
    await repo.create({
      shortCode: 'c1',
      originalUrl: 'https://example.com/a',
      customAlias: 'github',
      expiresAt: null,
    });

    const err = await repo
      .create({
        shortCode: 'c2',
        originalUrl: 'https://example.com/b',
        customAlias: 'github',
        expiresAt: null,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).field).toBe('customAlias');
  });

  it('finds a row by custom alias', async () => {
    await repo.create({
      shortCode: 'c3',
      originalUrl: 'https://github.com/',
      customAlias: 'gh',
      expiresAt: null,
    });

    const found = await repo.findByCustomAlias('gh');
    expect(found?.shortCode).toBe('c3');
    await expect(repo.findByCustomAlias('missing')).resolves.toBeNull();
  });

  it('deactivates without deleting (soft delete)', async () => {
    await repo.create({
      shortCode: 'gone01',
      originalUrl: 'https://example.com/gone',
      customAlias: null,
      expiresAt: null,
    });

    const deactivated = await repo.deactivate('gone01');
    expect(deactivated?.isActive).toBe(false);

    // The row still exists — upper layers decide that inactive means 410.
    const found = await repo.findByShortCode('gone01');
    expect(found?.isActive).toBe(false);

    await expect(repo.deactivate('unknown')).resolves.toBeNull();
  });

  it('stores and updates expiry', async () => {
    const expiresAt = new Date(Date.now() + 3_600_000);
    await repo.create({
      shortCode: 'exp001',
      originalUrl: 'https://example.com/exp',
      customAlias: null,
      expiresAt,
    });

    const found = await repo.findByShortCode('exp001');
    expect(found?.expiresAt).toBeInstanceOf(Date);

    const updated = await repo.update('exp001', { expiresAt: null });
    expect(updated?.expiresAt).toBeNull();

    const untouched = await repo.update('exp001', {});
    expect(untouched?.shortCode).toBe('exp001');
    await expect(repo.update('unknown', { isActive: false })).resolves.toBeNull();
  });
});
