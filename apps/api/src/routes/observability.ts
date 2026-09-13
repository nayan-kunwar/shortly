import { Router, type Request, type Response } from 'express';
import { renderAllMetrics } from '../observability/http-metrics.js';
import { checkReadiness } from '../observability/readiness.js';

export const readyRouter = Router();

readyRouter.get('/', async (_req: Request, res: Response) => {
  const readiness = await checkReadiness();
  res.status(readiness.status === 'ready' ? 200 : 503).json(readiness);
});

export const metricsRouter = Router();

metricsRouter.get('/', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.status(200).send(renderAllMetrics());
});
