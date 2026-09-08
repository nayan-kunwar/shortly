import { env } from '../config/env.js';
import { ConflictError } from '../errors/conflict-error.js';
import { GoneError } from '../errors/gone-error.js';
import { NotFoundError } from '../errors/not-found-error.js';
import type { UrlRepository } from '../repositories/url.repository.js';
import { encodeBase62 } from '../utils/base62.js';
import type { CreateUrlRequest } from '../validators/url.validator.js';

export interface CreatedUrl {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
}

export class UrlService {
  constructor(private readonly repo: UrlRepository) {}

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
    return this.toResponse(created.shortCode, created.originalUrl);
  }

  /**
   * Resolve a short code to its destination for the redirect path.
   * Expiry is lazy: checked here on every hit (no cron, no TTL sweeper yet).
   * Throws NotFoundError (unknown) or GoneError (deactivated/expired) —
   * the controller maps them to 404/410.
   */
  async resolveUrl(shortCode: string): Promise<{ originalUrl: string }> {
    const record = await this.repo.findByShortCode(shortCode);
    if (record === null) {
      throw new NotFoundError(`Unknown short code: ${shortCode}`);
    }
    if (!record.isActive) {
      throw new GoneError('deactivated');
    }
    if (record.expiresAt !== null && record.expiresAt.getTime() <= Date.now()) {
      throw new GoneError('expired');
    }
    return { originalUrl: record.originalUrl };
  }

  private toResponse(shortCode: string, originalUrl: string): CreatedUrl {
    return {
      shortCode,
      shortUrl: `${env.BASE_URL}/${shortCode}`,
      originalUrl,
    };
  }
}
