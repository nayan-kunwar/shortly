import { pool } from '../db/db.js';
import { getRedis } from '../redis/client.js';
import { connectRabbitMQ } from '../rabbitmq/connection.js';

export interface DependencyCheck {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface Readiness {
  status: 'ready' | 'not-ready';
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
    rabbitmq: DependencyCheck;
  };
}

const CHECK_TIMEOUT_MS = 3000;

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`check timed out after ${String(ms)}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function timed<T>(
  work: () => Promise<T>,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = performance.now();
  try {
    await withTimeout(work(), CHECK_TIMEOUT_MS);
    return { ok: true, latencyMs: Math.round((performance.now() - start) * 10) / 10 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

/**
 * Readiness probe: can this instance serve traffic RIGHT NOW?
 * Checks all three dependencies with timeouts (a hung dependency must not
 * hang the probe — load balancers interpret slowness as health).
 * Distinct from liveness (/health): alive ≠ ready to serve.
 */
export async function checkReadiness(): Promise<Readiness> {
  const [postgres, redis, rabbitmq] = await Promise.all([
    timed(() => pool.query('SELECT 1')),
    timed(async () => {
      const pong = await getRedis().ping();
      if (pong !== 'PONG') throw new Error(`unexpected PING reply: ${pong}`);
    }),
    timed(async () => {
      const connection = await connectRabbitMQ();
      await connection.close();
    }),
  ]);
  const ready = postgres.ok && redis.ok && rabbitmq.ok;
  return { status: ready ? 'ready' : 'not-ready', checks: { postgres, redis, rabbitmq } };
}
