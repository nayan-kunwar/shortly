import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { schema } from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/** Raw pool stays exported: the migration runner works in plain SQL. */
export const pool: Pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Small and explicit: M1 is single-instance. Pool size becomes a
  // capacity-planning knob in M21, not a guess today.
  max: 10,
  idleTimeoutMillis: 30_000,
  // Bounded waits (M15): a hung database must surface as an error, never
  // an eternally pending request. 5s to connect, 10s per statement.
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

pool.on('error', (err) => {
  // Idle-client errors would otherwise crash the process silently.
  console.error('Unexpected pg pool error', err);
});

/** Typed query client. Drizzle over node-postgres — SQL-shaped, no engine. */
export const db: Db = drizzle(pool, { schema });

/** Close pool on shutdown / after tests. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
