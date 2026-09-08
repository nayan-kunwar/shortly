import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let client: Redis | undefined;

/**
 * Fail-fast client factory. The two critical options:
 * - enableOfflineQueue:false — commands never buffer behind a dead Redis.
 *   Buffering would hang redirects until a timeout; failing fast lets the
 *   PG fallback answer in milliseconds.
 * - maxRetriesPerRequest:1 — one retry, then surface the error to the
 *   caller (which falls back to PostgreSQL).
 * Reconnect backoff (retryStrategy) stays on: transient blips heal without
 * restarts, while commands during the blip fail fast individually.
 */
export function createRedisClient(url: string = env.REDIS_URL): Redis {
  const redis = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 100, 2000),
    enableReadyCheck: true,
  });
  redis.on('error', (err) => {
    // Never throw: Redis is a performance optimization, not the source of
    // truth. Every command site handles rejection via PG fallback.
    console.error(`Redis error (degraded, PG fallback active): ${err.message}`);
  });
  return redis;
}

/** Process-wide client for the API. Closed on shutdown / in tests. */
export function getRedis(): Redis {
  if (client === undefined) {
    client = createRedisClient();
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client !== undefined) {
    const c = client;
    client = undefined;
    c.disconnect();
    await Promise.resolve();
  }
}
