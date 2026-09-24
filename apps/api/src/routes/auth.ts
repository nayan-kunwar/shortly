import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';

export function createAuthRouter(
  controller: AuthController,
  hooks: { credentialsLimiter: RequestHandler; requireAuth: RequestHandler },
): Router {
  const router = Router();
  router.post('/register', hooks.credentialsLimiter, controller.register);
  router.post('/login', hooks.credentialsLimiter, controller.login);
  router.post('/logout', hooks.requireAuth, controller.logout);
  router.get('/me', hooks.requireAuth, controller.me);
  return router;
}
