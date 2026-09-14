import { Router } from 'express';
import type { UrlsController } from '../controllers/urls.controller.js';

export function createStatsRouter(controller: UrlsController): Router {
  const router = Router();
  router.get('/', controller.getGlobalStats);
  router.get('/breakdowns', controller.getGlobalBreakdowns);
  return router;
}
