import cors from 'cors';
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { createUrlsController } from './controllers/urls.controller.js';
import { db } from './db/db.js';
import { env } from './config/env.js';
import { ConflictError } from './errors/conflict-error.js';
import { GoneError } from './errors/gone-error.js';
import { NotFoundError } from './errors/not-found-error.js';
import { UrlRepository } from './repositories/url.repository.js';
import { healthRouter } from './routes/health.js';
import { createRedirectRouter } from './routes/redirect.js';
import { createUrlsRouter } from './routes/urls.js';
import { UrlService } from './services/url.service.js';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // CORS for local frontend development only. Disabled in production, where
  // the frontend is same-origin (or the gateway owns CORS policy).
  // Function form: matching origins get an ACAO echo, everyone else gets
  // no CORS headers at all (a fixed string would echo on every response).
  if (env.NODE_ENV !== 'production') {
    app.use(
      cors({
        origin: (origin, callback) => {
          // Same-origin / non-browser requests carry no Origin — allow through.
          if (origin === undefined || origin === env.CORS_ORIGIN) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        },
      }),
    );
  }

  app.use('/health', healthRouter);

  // Route → Controller → Service → Repository → PostgreSQL.
  // Wired here (composition root) so handlers stay constructible in tests.
  const urlService = new UrlService(new UrlRepository(db));
  const urlsController = createUrlsController(urlService);
  app.use('/api/v1/urls', createUrlsRouter(urlsController));

  // ORDERING INVARIANT: the redirect router matches any single-segment GET
  // path, so it must be registered AFTER /health, /api/* (and later
  // /ready, /metrics in M14) — Express matches in registration order.
  app.use('/', createRedirectRouter(urlsController));

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
    if (err instanceof NotFoundError) {
      res.status(err.status).json({ error: 'NotFound', message: err.message });
      return;
    }
    if (err instanceof GoneError) {
      res.status(err.status).json({
        error: 'Gone',
        message: err.message,
        reason: err.reason,
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
