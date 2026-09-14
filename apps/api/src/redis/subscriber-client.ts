import { Redis } from 'ioredis';
import { log } from '../observability/logger.js';
import { env } from '../config/env.js';

let subscriber: Redis | undefined;

/**
 * Dedicated Redis connection for pub/sub subscriptions.
 * A subscriber connection enters "subscriber mode" and cannot issue regular
 * commands (SET, GET, etc.) — it must be a separate connection from the
 * main client used for caching and rate limiting.
 */
export function createSubscriberClient(url: string = env.REDIS_URL): Redis {
  const redis = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 100, 2000),
    enableReadyCheck: true,
  });
  redis.on('error', (err) => {
    log('error', 'Redis subscriber error', { error: err.message });
  });
  return redis;
}

/** Process-wide subscriber for the API. Closed on shutdown. */
export function getSubscriberClient(): Redis {
  if (subscriber === undefined) {
    subscriber = createSubscriberClient();
  }
  return subscriber;
}

export async function closeSubscriberClient(): Promise<void> {
  if (subscriber !== undefined) {
    const s = subscriber;
    subscriber = undefined;
    s.disconnect();
    await Promise.resolve();
  }
}
