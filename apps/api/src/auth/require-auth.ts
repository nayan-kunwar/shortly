import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { BadRequestError } from '../errors/bad-request-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { AuthService } from './auth.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    /**
     * Guest anchor for anonymous creates (X-Guest-Token header). Set only
     * in guest mode — never alongside userId.
     */
    guestId?: string;
  }
}

const BEARER = /^Bearer ([A-Za-z0-9_-]+)$/;

/** Guest tokens are server-issued UUIDs. Malformed values are rejected, never coerced. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (header === undefined) return null;
  const match = BEARER.exec(header);
  return match?.[1] ?? null;
}

/** Loads the session and sets req.userId. Missing or expired tokens are 401. */
export function requireAuth(auth: AuthService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readBearerToken(req);
    if (token === null) {
      next(new UnauthorizedError());
      return;
    }
    void auth
      .resolveUserId(token)
      .then((userId) => {
        if (userId === null) {
          next(new UnauthorizedError());
          return;
        }
        req.userId = userId;
        next();
      })
      .catch(next);
  };
}

/**
 * Three-way identity gate for guest-capable routes:
 * - no Authorization header → anonymous guest (optional X-Guest-Token anchor).
 * - valid Bearer → req.userId, guest mode off.
 * - present-but-invalid Bearer → 401. Never silently downgrade: an expired
 *   session filing links into guest limbo while the user believes they are
 *   saved is worse than an explicit login prompt.
 */
export function optionalAuth(auth: AuthService): RequestHandler {
  const strict = requireAuth(auth);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.get('authorization') === undefined) {
      const guest = req.get('x-guest-token');
      if (guest !== undefined) {
        // Malformed (not a UUID) means corrupt client storage. 400 with a
        // machine-readable code so the frontend can drop it and retry —
        // never 401: this must not trip the signed-in logout flow.
        if (!UUID.test(guest)) {
          next(new BadRequestError('Guest session is invalid', 'GUEST_TOKEN_INVALID'));
          return;
        }
        req.guestId = guest;
      }
      next();
      return;
    }
    strict(req, res, next);
  };
}
