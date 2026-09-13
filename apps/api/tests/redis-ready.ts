import { getRedis } from '../src/redis/client.js';

/**
 * Fail-fast client options mean the first command can race connection setup.
 * Gate each cache-reading suite on readiness once (beforeAll); later
 * commands reuse the live connection. Fails with a actionable message when
 * Redis is down instead of mid-suite races.
 */
export async function waitForRedis(timeoutMs = 10_000): Promise<void> {
  const redis = getRedis();
  if (redis.status === 'ready') return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Redis not ready — run: docker compose up -d redis'));
    }, timeoutMs);
    redis.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
