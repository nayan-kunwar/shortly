import { randomUUID } from 'node:crypto';
import type { Application } from 'express';
import request from 'supertest';
import { createApp, registerFallback, type AppDeps } from '../src/app.js';
import { getRedis } from '../src/redis/client.js';
import { db } from '../src/db/db.js';
import { users } from '../src/db/schema.js';

/**
 * Shared polling helper for async assertions (outbox append is
 * fire-and-forget; broker delivery is eventual). Rejects on timeout.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 100,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await condition()) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`waitFor timed out after ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Insert a user row so URL foreign keys have an owner. */
export async function insertUser(email?: string): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: email ?? `${id}@example.com`,
    passwordHash: 'test-hash',
  });
  return id;
}

let authSeq = 0;

/** Register through the API and return a bearer header for private routes. */
export async function registerAuth(
  app: Application,
): Promise<{ Authorization: string; userId: string }> {
  try {
    const redis = getRedis();
    const keys = await redis.keys('ratelimit:auth:credentials:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Credential limiting fails open when Redis is down.
  }
  authSeq += 1;
  const email = `user-${String(authSeq)}-${String(Date.now())}@example.com`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'password123' });
  if (res.status !== 201) {
    throw new Error(`register failed: ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
  const token = String(res.body.token);
  const userId = String((res.body.user as { id: string }).id);
  return { Authorization: `Bearer ${token}`, userId };
}

/** App plus a supertest agent that already sends a fresh bearer token. */
export async function authedClient(deps?: AppDeps) {
  const created = createApp(deps ?? {});
  registerFallback(created.app);
  const auth = await registerAuth(created.app);
  const api = request.agent(created.app);
  api.set('Authorization', auth.Authorization);
  return { ...created, api, auth };
}
