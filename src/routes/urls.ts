import { Router } from 'express';
import type { UrlsController } from '../controllers/urls.controller.js';

export function createUrlsRouter(controller: UrlsController): Router {
  const router = Router();
  router.post('/', controller.createUrl);
  router.delete('/:shortCode', controller.deleteUrl);
  return router;
}
