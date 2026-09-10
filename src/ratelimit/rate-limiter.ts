import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { getRedis } from '../redis/client.js';
import { recordRateLimitExceeded } from './rate-limit-metrics.js';

/**
 * Atomic fixed-window increment. INCR + "expire only on first sight" must
 * be one atomic step — two concurrent requests could otherwise both see
 * count 1 and both skip EXPIRE, leaking a key that never resets.
 */
const INCR_WITH_TTL = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Max requests per window per key. */
  maxRequests: number;
  /** Key namespace, e.g. 'urls:create'. One namespace per protected route. */
  keyPrefix: string;
  /** Injected in tests (broken clients prove fail-open). Defaults to shared. */
  redis?: Redis;
  /** Override IP extraction (tests, proxies — see M17 trust-proxy note). */
  keyFrom?: (req: Request) => string;
}

function clientIp(req: Request): string {
  // Express parses X-Forwarded-For only with 'trust proxy' (M17 sets it
  // behind Nginx). Until then this is the direct peer — correct locally,
  // coarse behind shared NATs (documented limitation, not a bug).
  return req.ip ?? 'unknown';
}

/**
 * Fixed-window rate limiter. First algorithm deliberately: one INCR per
 * request, exact counts, trivially inspectable (TTL = reset time).
 * Sliding-window/token-bucket graduate in only if burst abuse is measured.
 *
 * Fail-OPEN on Redis errors: rate limiting is protection, not correctness.
 * Failing closed would convert a Redis blip into a full API outage.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { windowSeconds, maxRequests, keyPrefix } = options;
  const redis = options.redis ?? getRedis();
  const keyFrom = options.keyFrom ?? clientIp;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `ratelimit:${keyPrefix}:${keyFrom(req)}`;
    let count: number;
    let ttl: number;
    try {
      const result = (await redis.eval(INCR_WITH_TTL, 1, key, String(windowSeconds))) as [
        number,
        number,
      ];
      [count, ttl] = result;
    } catch (err) {
      console.error(`Rate limiter degraded (allowing request): ${(err as Error).message}`);
      next();
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)));

    if (count > maxRequests) {
      recordRateLimitExceeded();
      res.setHeader('Retry-After', String(Math.max(ttl, 0)));
      res.status(429).json({
        error: 'TooManyRequests',
        message: `Rate limit exceeded: ${String(maxRequests)} requests per ${String(windowSeconds)}s`,
      });
      return;
    }
    next();
  };
}
