import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url. Only the SHA-256 is persisted. */
export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
