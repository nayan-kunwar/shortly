import { env } from '../config/env.js';
import { ConflictError } from '../errors/conflict-error.js';
import type { UrlRepository } from '../repositories/url.repository.js';
import { generateShortCode } from '../utils/short-code.js';
import type { CreateUrlRequest } from '../validators/url.validator.js';

const MAX_CODE_ATTEMPTS = 5;

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
   * - Generated code: retry on collision (birthday paradox is real, the
   *   unique constraint is the backstop). M3 removes the loop entirely.
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

    let lastConflict: unknown = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const shortCode = generateShortCode();
      try {
        const created = await this.repo.create({
          shortCode,
          originalUrl: input.url,
          customAlias: null,
          expiresAt,
        });
        return this.toResponse(created.shortCode, created.originalUrl);
      } catch (err) {
        if (err instanceof ConflictError && err.field === 'shortCode') {
          lastConflict = err;
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `Failed to generate a unique short code after ${String(MAX_CODE_ATTEMPTS)} attempts: ${String(lastConflict)}`,
    );
  }

  private toResponse(shortCode: string, originalUrl: string): CreatedUrl {
    return {
      shortCode,
      shortUrl: `${env.BASE_URL}/${shortCode}`,
      originalUrl,
    };
  }
}
