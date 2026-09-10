import { Router, type RequestHandler } from 'express';
import type { UrlsController } from '../controllers/urls.controller.js';

export interface UrlsRouterHooks {
  /** Extra middleware for the analytics read (own rate-limit namespace). */
  analyticsMiddleware?: RequestHandler | undefined;
}

export function createUrlsRouter(controller: UrlsController, hooks: UrlsRouterHooks = {}): Router {
  const router = Router();
  router.post('/', controller.createUrl);
  router.delete('/:shortCode', controller.deleteUrl);
  const analyticsChain: RequestHandler[] =
    hooks.analyticsMiddleware !== undefined ? [hooks.analyticsMiddleware] : [];
  router.get('/:shortCode/analytics', ...analyticsChain, controller.getAnalytics);
  return router;
}
