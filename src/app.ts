import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { createUrlsController } from './controllers/urls.controller.js';
import { db } from './db/db.js';
import { ConflictError } from './errors/conflict-error.js';
import { UrlRepository } from './repositories/url.repository.js';
import { healthRouter } from './routes/health.js';
import { createUrlsRouter } from './routes/urls.js';
import { UrlService } from './services/url.service.js';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);

  // Route → Controller → Service → Repository → PostgreSQL.
  // Wired here (composition root) so handlers stay constructible in tests.
  const urlService = new UrlService(new UrlRepository(db));
  app.use('/api/v1/urls', createUrlsRouter(createUrlsController(urlService)));

  // Express 5: bare fallback middleware (no '*' path — v5 uses a new path syntax).
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'NotFound',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Central error handler (4 args required so Express treats it as error middleware).
  // In Express 5, rejected promises in async handlers are forwarded here automatically.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid request body',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(err.status).json({
        error: 'Conflict',
        message: err.message,
        field: err.field,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
        ? ((err as { status: number }).status as number)
        : 500;
    res.status(status).json({ error: 'InternalServerError', message });
  });

  return app;
}
