import { Router } from 'express';
import type { UrlsController } from '../controllers/urls.controller.js';

export function createRedirectRouter(controller: UrlsController): Router {
  const router = Router();
  router.get('/:shortCode', controller.redirect);
  return router;
}
