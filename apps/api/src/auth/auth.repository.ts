import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from '../db/db.js';
import { guests, sessions, users } from '../db/schema.js';
import { ConflictError } from '../errors/conflict-error.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

function findUniqueViolation(err: unknown): { constraint: string | undefined } | null {
  let current: unknown = err;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof current !== 'object' || current === null) return null;
    const rec = current as Record<string, unknown>;
    if (rec['code'] === '23505') {
      const constraint = rec['constraint'];
      return { constraint: typeof constraint === 'string' ? constraint : undefined };
    }
    if (!('cause' in rec)) return null;
    current = rec['cause'];
  }
  return null;
}

export class AuthRepository {
  constructor(private readonly db: Db) {}

  async createUser(email: string, passwordHash: string): Promise<UserRecord> {
    try {
      const rows = await this.db
        .insert(users)
        .values({ email, passwordHash })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('INSERT did not return a user');
      return row;
    } catch (err) {
      const violation = findUniqueViolation(err);
      if (violation?.constraint === 'users_email_unique') {
        throw new ConflictError('email');
      }
      throw err;
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email));
    return rows[0] ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0] ?? null;
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(sessions).values({ userId, tokenHash, expiresAt });
  }

  /** Active session only. Expired rows are treated as missing. */
  async findUserIdByTokenHash(tokenHash: string, now: Date = new Date()): Promise<string | null> {
    const rows = await this.db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
    return rows[0]?.userId ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  /** Mint a guest identity. Cheap row: no credentials, no profile. */
  async createGuest(): Promise<string> {
    const rows = await this.db.insert(guests).values({}).returning({ id: guests.id });
    const row = rows[0];
    if (row === undefined) throw new Error('INSERT did not return a guest');
    return row.id;
  }

  async guestExists(guestId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.id, guestId));
    return rows.length > 0;
  }

  /** Remove a guest anchor after its links move to an account. */
  async deleteGuest(guestId: string): Promise<void> {
    await this.db.delete(guests).where(eq(guests.id, guestId));
  }

  /** Housekeeping: expired rows are already rejected at lookup; this just reclaims space. */
  async purgeExpiredSessions(now: Date = new Date()): Promise<number> {
    const deleted = await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))
      .returning({ id: sessions.userId });
    return deleted.length;
  }
}
