import { recordCacheHit, recordCacheMiss } from '../cache/cache-metrics.js';
import type { CachedEntry, UrlCache } from '../cache/url-cache.js';
import { buildClickEvent, type ClickContext, type ClickEmitter } from '../analytics/click-event.js';
import { recordAnalyticsEventCreated } from '../analytics/analytics-metrics.js';
import { env } from '../config/env.js';
import { ConflictError } from '../errors/conflict-error.js';
import { GoneError } from '../errors/gone-error.js';
import { NotFoundError } from '../errors/not-found-error.js';
import type { UrlRepository } from '../repositories/url.repository.js';
import type { UpdateUrlPatch, UrlRecord } from '../types/url.js';
import { encodeBase62 } from '../utils/base62.js';
import type { CreateUrlRequest } from '../validators/url.validator.js';

export interface CreatedUrl {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
}

export class UrlService {
  constructor(
    private readonly repo: UrlRepository,
    private readonly cache: UrlCache,
    private readonly emitter: ClickEmitter,
  ) {}

  /**
   * Create a shortened URL.
   * - Custom alias: single attempt; a 23505 becomes ConflictError → 409.
   * - Generated code: sequence id → Base62 in one transaction. No retry
   *   loop — determinism replaced probability (M3 deleted the M2 loop).
   */
  async createShortUrl(input: CreateUrlRequest): Promise<CreatedUrl> {
    const customAlias = input.customAlias ?? null;
    const expiresAt = input.expiresAt != null ? new Date(input.expiresAt) : null;

    if (customAlias !== null) {
      try {
        const created = await this.repo.create({
          shortCode: customAlias,
          originalUrl: input.url,
          customAlias,
          expiresAt,
        });
        // A negative entry for this alias may exist from an earlier miss.
        await this.cache.invalidate(customAlias);
        return this.toResponse(created.shortCode, created.originalUrl);
      } catch (err) {
        // The alias is stored as the row's short_code too, so a duplicate
        // alias can trip either unique constraint — Postgres reports only
        // one. The user supplied an alias, so the conflict is always on it.
        if (err instanceof ConflictError) throw new ConflictError('customAlias');
        throw err;
      }
    }

    const created = await this.repo.createWithGeneratedCode(
      { originalUrl: input.url, customAlias: null, expiresAt },
      encodeBase62,
    );
    await this.cache.invalidate(created.shortCode);
    return this.toResponse(created.shortCode, created.originalUrl);
  }

  /** Service owns every mutation so invalidation cannot be forgotten by callers. */
  async deactivateUrl(shortCode: string): Promise<UrlRecord | null> {
    const row = await this.repo.deactivate(shortCode);
    await this.cache.invalidate(shortCode);
    return row;
  }

  async updateUrl(shortCode: string, patch: UpdateUrlPatch): Promise<UrlRecord | null> {
    const row = await this.repo.update(shortCode, patch);
    await this.cache.invalidate(shortCode);
    return row;
  }

  /**
   * Resolve a short code for the redirect path. Cache-aside:
   * HIT → answer from Redis (re-checking lazy expiry on cached rows);
   * MISS or Redis error → PostgreSQL, then populate (negatives briefly).
   * Redis is never required: every failure path ends at the source of truth.
   *
   * Emits one `url.clicked` event on success only — fire-and-forget through
   * the injected emitter (sync contract: never awaited). 404/410 answers
   * emit nothing; they are HTTP errors for M14 metrics, not counted clicks.
   */
  async resolveUrl(
    shortCode: string,
    ctx: Omit<ClickContext, 'shortCode'> = { ip: null, userAgent: null, referer: null },
  ): Promise<{ originalUrl: string }> {
    const resolved = await this.doResolve(shortCode);
    try {
      this.emitter.emit(buildClickEvent({ ...ctx, shortCode }));
      recordAnalyticsEventCreated();
    } catch (err) {
      // Analytics must never break redirects — not even a buggy emitter.
      console.error(`Click emission failed (redirect unaffected): ${(err as Error).message}`);
    }
    return resolved;
  }

  private async doResolve(shortCode: string): Promise<{ originalUrl: string }> {
    const cached = await this.cache.lookup(shortCode);
    if (cached.hit) {
      recordCacheHit();
      return this.fromCache(shortCode, cached.value);
    }
    recordCacheMiss();

    const record = await this.repo.findByShortCode(shortCode);
    if (record === null) {
      await this.cache.store(shortCode, { kind: 'missing' });
      throw new NotFoundError(`Unknown short code: ${shortCode}`);
    }
    if (!record.isActive) {
      await this.cache.store(shortCode, { kind: 'gone', reason: 'deactivated' });
      throw new GoneError('deactivated');
    }
    if (record.expiresAt !== null && record.expiresAt.getTime() <= Date.now()) {
      await this.cache.store(shortCode, { kind: 'gone', reason: 'expired' });
      throw new GoneError('expired');
    }
    await this.cache.store(shortCode, {
      kind: 'url',
      originalUrl: record.originalUrl,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      isActive: record.isActive,
    });
    return { originalUrl: record.originalUrl };
  }

  /** Interpret a cache hit with the same rules as a DB row. Throws 404/410. */
  private fromCache(shortCode: string, entry: CachedEntry | null): { originalUrl: string } {
    if (entry === null || entry.kind === 'missing') {
      throw new NotFoundError(`Unknown short code: ${shortCode}`);
    }
    if (entry.kind === 'gone') {
      throw new GoneError(entry.reason);
    }
    if (!entry.isActive) {
      throw new GoneError('deactivated');
    }
    if (entry.expiresAt !== null && Date.parse(entry.expiresAt) <= Date.now()) {
      throw new GoneError('expired');
    }
    return { originalUrl: entry.originalUrl };
  }

  private toResponse(shortCode: string, originalUrl: string): CreatedUrl {
    return {
      shortCode,
      shortUrl: `${env.BASE_URL}/${shortCode}`,
      originalUrl,
    };
  }
}
