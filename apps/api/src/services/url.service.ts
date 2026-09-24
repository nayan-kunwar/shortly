import { recordCacheHit, recordCacheMiss } from '../cache/cache-metrics.js';
import type { CachedEntry, UrlCache } from '../cache/url-cache.js';
import { buildClickEvent, type ClickContext, type ClickEmitter } from '../analytics/click-event.js';
import { recordAnalyticsEventCreated } from '../analytics/analytics-metrics.js';
import type { ClickEventRepository, ClickStats } from '../analytics/click-event-repository.js';
import type { AuthRepository } from '../auth/auth.repository.js';
import { BadRequestError } from '../errors/bad-request-error.js';
import { env } from '../config/env.js';
import { ConflictError } from '../errors/conflict-error.js';
import { GoneError } from '../errors/gone-error.js';
import { NotFoundError } from '../errors/not-found-error.js';
import { log } from '../observability/logger.js';
import type { UrlRepository } from '../repositories/url.repository.js';
import type { UpdateUrlPatch, UrlRecord } from '../types/url.js';
import { generateRandomCode } from '../utils/base62.js';
import type { CreateUrlRequest, ListUrlsQuery } from '../validators/url.validator.js';

export interface CreatedUrl {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  /** Present only when a guest identity was minted for this create. */
  guestId?: string;
}

/**
 * Who is creating: an account, or an anonymous guest anchor.
 * Guests are restricted (no custom aliases) at the service layer so every
 * entry point — HTTP today, anything else tomorrow — enforces the same rule.
 */
export type CreateIdentity = { userId: string } | { guestId: string | null };

export interface ListedUrlResponse {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  customAlias: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
  clicks: number;
}

export type UrlDetails = ListedUrlResponse;

export interface UrlAnalytics extends ClickStats {
  shortCode: string;
}

export interface GlobalStats {
  totalUrls: number;
  activeUrls: number;
  totalClicks: number;
  clicksToday: number;
}

export class UrlService {
  constructor(
    private readonly repo: UrlRepository,
    private readonly cache: UrlCache,
    private readonly emitter: ClickEmitter,
    private readonly analytics: ClickEventRepository,
    /**
     * Guest issuer for anonymous creates. Optional so unit tests can
     * construct the service without identity infrastructure; production
     * always wires it (guest creates throw without it).
     */
    private readonly guests?: AuthRepository,
  ) {}

  /**
   * Create a shortened URL.
   * - Account: full feature set (custom alias with 409 on conflict).
   * - Guest: generated codes only — custom aliases need an account (this
   *   kills alias squatting and doubles as the signup nudge). A missing
   *   guest anchor mints one (returned so the client can store it); an
   *   unknown anchor mints a replacement (stale storage self-heals).
   * - Generated code: random 7-char Base62 with retry on UNIQUE violation.
   */
  async createShortUrl(input: CreateUrlRequest, identity: CreateIdentity): Promise<CreatedUrl> {
    if (!('userId' in identity)) {
      return this.createGuestUrl(input, identity.guestId);
    }
    const userId = identity.userId;
    const customAlias = input.customAlias ?? null;
    const expiresAt = input.expiresAt != null ? new Date(input.expiresAt) : null;

    if (customAlias !== null) {
      try {
        const created = await this.repo.create({
          shortCode: customAlias,
          originalUrl: input.url,
          customAlias,
          expiresAt,
          userId,
          guestId: null,
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

    const SHORT_CODE_LENGTH = 7;
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const code = generateRandomCode(SHORT_CODE_LENGTH);
      try {
        const created = await this.repo.create({
          shortCode: code,
          originalUrl: input.url,
          customAlias: null,
          expiresAt,
          userId,
          guestId: null,
        });
        await this.cache.invalidate(created.shortCode);
        return this.toResponse(created.shortCode, created.originalUrl);
      } catch (err) {
        if (err instanceof ConflictError && err.field === 'shortCode') {
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `Failed to generate a unique short code after ${String(MAX_RETRIES)} attempts`,
    );
  }

  /**
   * Anonymous create: generated code stamped with a guest anchor.
   * Returns the anchor when one was minted so the client can store it.
   */
  private async createGuestUrl(input: CreateUrlRequest, guestId: string | null): Promise<CreatedUrl> {
    if (input.customAlias != null) {
      throw new BadRequestError('Sign in to use custom aliases', 'GUEST_ALIAS_FORBIDDEN');
    }
    if (this.guests === undefined) {
      throw new Error('Guest creates require a guest issuer');
    }
    let anchor = guestId;
    let minted = false;
    if (anchor === null || !(await this.guests.guestExists(anchor))) {
      anchor = await this.guests.createGuest();
      minted = true;
    }
    const expiresAt = input.expiresAt != null ? new Date(input.expiresAt) : null;

    const SHORT_CODE_LENGTH = 7;
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const code = generateRandomCode(SHORT_CODE_LENGTH);
      try {
        const created = await this.repo.create({
          shortCode: code,
          originalUrl: input.url,
          customAlias: null,
          expiresAt,
          userId: null,
          guestId: anchor,
        });
        await this.cache.invalidate(created.shortCode);
        const response = this.toResponse(created.shortCode, created.originalUrl);
        return minted ? { ...response, guestId: anchor } : response;
      } catch (err) {
        if (err instanceof ConflictError && err.field === 'shortCode') {
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `Failed to generate a unique short code after ${String(MAX_RETRIES)} attempts`,
    );
  }

  /**
   * Move a guest's unclaimed links onto an account. Idempotent: claiming
   * twice (or claiming an unknown/empty anchor) returns what moved, which
   * may be nothing. The guest anchor is retired afterwards either way.
   */
  async claimGuestLinks(guestId: string, userId: string): Promise<string[]> {
    const claimed = await this.repo.claimGuestLinks(guestId, userId);
    if (this.guests !== undefined) {
      await this.guests.deleteGuest(guestId);
    }
    return claimed;
  }

  /** Service owns every mutation so invalidation cannot be forgotten by callers. */
  async deactivateUrl(shortCode: string, userId: string): Promise<UrlRecord | null> {
    const row = await this.repo.deactivate(shortCode, userId);
    if (row !== null) await this.cache.invalidate(shortCode);
    return row;
  }

  async updateUrl(shortCode: string, patch: UpdateUrlPatch, userId: string): Promise<UrlRecord | null> {
    const row = await this.repo.update(shortCode, patch, userId);
    if (row !== null) await this.cache.invalidate(shortCode);
    return row;
  }

  /** Private-plane existence check. Unknown and unowned codes are the same 404. */
  async assertOwned(shortCode: string, userId: string): Promise<void> {
    const record = await this.repo.findOwned(shortCode, userId);
    if (record === null) {
      throw new NotFoundError(`Unknown short code: ${shortCode}`);
    }
  }

  /**
   * Dashboard read: thin layer over the aggregation repository. 404 when
   * the URL itself is unknown (M12 returns zeros without knowing URLs).
   * No freshness guarantee documented beyond eventual consistency (M9–M11).
   */
  async getUrlAnalytics(shortCode: string, userId: string): Promise<UrlAnalytics> {
    const record = await this.repo.findOwned(shortCode, userId);
    if (record === null) {
      throw new NotFoundError(`Unknown short code: ${shortCode}`);
    }
    const stats = await this.analytics.getStats(shortCode);
    return { shortCode, ...stats };
  }

  /**
   * Dashboard totals. Four COUNT(*) queries, no joins, no filters beyond
   * indexed flags. "Today" is a UTC day boundary — documented, timezone-
   * free, and consistent across instances regardless of server locale.
   */
  async getGlobalStats(userId: string, now: Date = new Date()): Promise<GlobalStats> {
    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const [totalUrls, activeUrls, totalClicks, clicksToday] = await Promise.all([
      this.repo.countUrls(false, userId),
      this.repo.countUrls(true, userId),
      this.analytics.countForUser(userId),
      this.analytics.countForUser(userId, startOfTodayUtc),
    ]);
    return { totalUrls, activeUrls, totalClicks, clicksToday };
  }

  /** Dashboard breakdowns: countries, devices, browsers, referrers across all clicks. */
  async getGlobalBreakdowns(userId: string) {
    return this.analytics.getBreakdownsForUser(userId);
  }

  /**
   * Keyset list page (newest first). No total count by design (M-reads doc).
   */
  async listUrls(
    query: ListUrlsQuery,
    userId: string,
  ): Promise<{ items: ListedUrlResponse[]; nextCursor: string | null }> {
    const result = await this.repo.listUrls({
      limit: query.limit,
      cursorId: query.cursor,
      search: query.search,
      userId,
    });
    return {
      items: result.items.map((item) => this.toListed(item)),
      nextCursor: result.nextCursor,
    };
  }

  /** Single-URL details with lifetime clicks. 404 when unknown. */
  async getUrlDetails(shortCode: string, userId: string): Promise<UrlDetails> {
    const record = await this.repo.findOwned(shortCode, userId);
    if (record === null) {
      throw new NotFoundError(`Unknown short code: ${shortCode}`);
    }
    const clicks = await this.analytics.countByShortCode(shortCode);
    return { ...this.toListed(record), clicks };
  }

  private toListed(record: UrlRecord & { clicks?: number | undefined }): ListedUrlResponse {
    return {
      shortCode: record.shortCode,
      shortUrl: `${env.BASE_URL}/${record.shortCode}`,
      originalUrl: record.originalUrl,
      customAlias: record.customAlias,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      isActive: record.isActive,
      clicks: record.clicks ?? 0,
    };
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
      log('error', 'Click emission failed (redirect unaffected)', {
        error: (err as Error).message,
      });
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
