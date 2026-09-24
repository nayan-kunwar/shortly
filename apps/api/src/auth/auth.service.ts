import { env } from '../config/env.js';
import { ConflictError } from '../errors/conflict-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { AuthRepository } from './auth.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async register(email: string, password: string): Promise<AuthSession> {
    const passwordHash = await hashPassword(password);
    try {
      const user = await this.repo.createUser(email, passwordHash);
      return this.issueSession(user.id, user.email);
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new ConflictError('email', 'An account with this email already exists');
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.repo.findUserByEmail(email);
    if (user === null) {
      // Spend the same scrypt work so a missing email is not obviously faster.
      await hashPassword(password);
      throw new UnauthorizedError('Invalid email or password');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid email or password');
    return this.issueSession(user.id, user.email);
  }

  async logout(token: string): Promise<void> {
    await this.repo.deleteSession(hashSessionToken(token));
  }

  async resolveUserId(token: string): Promise<string | null> {
    return this.repo.findUserIdByTokenHash(hashSessionToken(token));
  }

  async me(userId: string): Promise<AuthUser | null> {
    const user = await this.repo.findUserById(userId);
    if (user === null) return null;
    return { id: user.id, email: user.email };
  }

  /** Mint an anonymous ownership anchor for guest creates. */
  async issueGuest(): Promise<string> {
    return this.repo.createGuest();
  }

  private async issueSession(userId: string, email: string): Promise<AuthSession> {
    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_SECONDS * 1000);
    await this.repo.createSession(userId, tokenHash, expiresAt);
    return { token, user: { id: userId, email } };
  }
}
