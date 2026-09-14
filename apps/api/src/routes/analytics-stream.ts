import { Router } from 'express';
import type { AnalyticsSseController } from '../controllers/analytics-sse.controller.js';

export function createAnalyticsSseRouter(controller: AnalyticsSseController): Router {
  const router = Router();
  router.get('/:shortCode/analytics/stream', controller.streamAnalytics);
  return router;
}
