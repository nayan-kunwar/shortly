import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { AuthService } from '../auth/auth.service.js';
import { readBearerToken } from '../auth/require-auth.js';
import { credentialsSchema } from '../validators/auth.validator.js';

export function createAuthController(auth: AuthService) {
  return {
    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const input = credentialsSchema.parse(req.body);
        const session = await auth.register(input.email, input.password);
        res.status(201).json(session);
      } catch (err) {
        next(err);
      }
    },

    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const input = credentialsSchema.parse(req.body);
        const session = await auth.login(input.email, input.password);
        res.status(200).json(session);
      } catch (err) {
        next(err);
      }
    },

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const token = readBearerToken(req);
        if (token === null) throw new UnauthorizedError();
        await auth.logout(token);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        if (req.userId === undefined) throw new UnauthorizedError();
        const user = await auth.me(req.userId);
        if (user === null) throw new UnauthorizedError();
        res.status(200).json(user);
      } catch (err) {
        next(err);
      }
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
