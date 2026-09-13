import type { Redis } from 'ioredis';
import { env } from '../config/env.js';

/** Negative entries (missing/gone) live briefly: they blunt hot-key DB
 * hammering without pinning a wrong answer for long. */
export const NEGATIVE_TTL_SECONDS = 60;

export type CachedEntry =
  | { kind: 'url'; originalUrl: string; expiresAt: string | null; isActive: boolean }
  | { kind: 'gone'; reason: 'deactivated' | 'expired' }
  | { kind: 'missing' };

export interface CacheLookup {
  /** True when Redis answered (even with a negative entry). False on real
   * miss AND on Redis errors — both mean "ask PostgreSQL". */
  hit: boolean;
  value: CachedEntry | null;
}

/**
 * Cache-aside store for short-code resolution. Never throws: every method
 * degrades to miss/no-op so Redis can never break correctness.
 */
export class UrlCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number = env.REDIS_TTL,
  ) {}

  key(shortCode: string): string {
    return `url:${shortCode}`;
  }

  async lookup(shortCode: string): Promise<CacheLookup> {
    try {
      const raw = await this.redis.get(this.key(shortCode));
      if (raw === null) return { hit: false, value: null };
      return { hit: true, value: JSON.parse(raw) as CachedEntry };
    } catch {
      return { hit: false, value: null };
    }
  }

  async store(shortCode: string, entry: CachedEntry): Promise<void> {
    const ttl = entry.kind === 'url' ? this.ttlSeconds : NEGATIVE_TTL_SECONDS;
    try {
      await this.redis.set(this.key(shortCode), JSON.stringify(entry), 'EX', ttl);
    } catch {
      // Cache write failure is invisible by design — the DB already answered.
    }
  }

  async invalidate(shortCode: string): Promise<void> {
    try {
      await this.redis.del(this.key(shortCode));
    } catch {
      // A stale entry expires via TTL; invalidation is best-effort.
    }
  }
}
