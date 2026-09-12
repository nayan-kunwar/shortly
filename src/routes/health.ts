import { hostname } from 'node:os';
import { Router, type Request, type Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    env: process.env['NODE_ENV'] ?? 'development',
    // Instance identity (M17): the only way to observe which replica
    // answered through the load balancer. Container hostname in compose.
    instance: hostname(),
  });
});
