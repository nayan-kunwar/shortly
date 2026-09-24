import cors from 'cors';
import express, { type Application, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { createUrlsController } from './controllers/urls.controller.js';
import { AuthRepository } from './auth/auth.repository.js';
import { AuthService } from './auth/auth.service.js';
import { optionalAuth, requireAuth } from './auth/require-auth.js';
import { createAuthController } from './controllers/auth.controller.js';
import { UrlCache } from './cache/url-cache.js';
import { ClickEventRepository } from './analytics/click-event-repository.js';
import type { ClickEmitter } from './analytics/click-event.js';
import { db } from './db/db.js';
import { env } from './config/env.js';
import { ConflictError } from './errors/conflict-error.js';
import { BadRequestError } from './errors/bad-request-error.js';
import { isDatabaseUnavailable, ServiceUnavailableError } from './errors/database-error.js';
import { GoneError } from './errors/gone-error.js';
import { NotFoundError } from './errors/not-found-error.js';
import { UnauthorizedError } from './errors/unauthorized-error.js';
import { UrlRepository } from './repositories/url.repository.js';
import { OutboxClickEmitter } from './outbox/outbox-emitter.js';
import { OutboxRepository } from './outbox/outbox-repository.js';
import { createRateLimiter } from './ratelimit/rate-limiter.js';
import { getRedis } from './redis/client.js';
import {
  requestContextMiddleware,
  requestLoggingMiddleware,
} from './observability/http-metrics.js';
import { healthRouter } from './routes/health.js';
import { metricsRouter, readyRouter } from './routes/observability.js';
import { docsRouter } from './routes/docs.js';
import { createRedirectRouter } from './routes/redirect.js';
import { createAuthRouter } from './routes/auth.js';
import { createStatsRouter } from './routes/stats.js';
import { createUrlsRouter } from './routes/urls.js';
import { UrlService } from './services/url.service.js';

export interface AppDeps {
  /** Override the redirect cache (tests inject broken/observed instances). */
  cache?: UrlCache;
  /**
   * Override the creation rate limiter. Tests inject tight limits or broken
   * Redis; pass `null` to disable limiting entirely for a test app.
   */
  rateLimiter?: ReturnType<typeof createRateLimiter> | null;
  /**
   * Override the anonymous-create limiter (strict anti-abuse budget).
   * Same null-disable semantics as rateLimiter.
   */
  guestRateLimiter?: ReturnType<typeof createRateLimiter> | null;
  /** Override the click emitter (tests collect; default persists to outbox). */
  emitter?: ClickEmitter;
}

export interface AppResult {
  app: Application;
  urlService: UrlService;
  /** Session gate for routes mounted after createApp (SSE). */
  requireAuth: RequestHandler;
}

export function createApp(deps: AppDeps = {}): AppResult {
  const app = express();

  app.disable('x-powered-by');
  // Helmet security headers — disable cross-origin isolation policies that
  // block cross-origin API access from a separate frontend domain (Vercel).
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  // Exactly one trusted proxy hop (Nginx, M17). Trusts X-Forwarded-For for
  // req.ip (rate limiting sees real clients, not the LB) while direct
  // connections (healthchecks, local dev) are unaffected — no XFF, no parse.
  // Never `true`: trusting all hops lets spoofed XFFs forge client IPs.
  app.set('trust proxy', 1);
  // Request context + access log first: the finish listener must attach to
  // every request, and ids must exist before any log line (route patterns
  // are read lazily at finish time, so order vs routers doesn't matter).
  app.use(requestContextMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(express.json({ limit: '100kb' }));

  // CORS: function form ensures only configured origins get an ACAO header.
  // Same-origin / non-browser requests (no Origin) pass through.
  // CORS_ORIGIN can be a single URL or comma-separated list.
  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''));
  app.use(
    cors({
      origin: (origin, callback) => {
        const normalized = (origin ?? '').replace(/\/+$/, '');
        if (normalized === '' || allowedOrigins.includes(normalized)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Token'],
    }),
  );

  app.use('/health', healthRouter);
  // /ready and /metrics join the must-register-before-redirect set:
  // single-segment GETs that the redirect router would swallow as codes.
  app.use('/ready', readyRouter);
  app.use('/metrics', metricsRouter);
  // API docs (Swagger UI + raw JSON). Development only: no docs surface
  // in production, and /docs* would otherwise read as short codes.
  if (env.NODE_ENV !== 'production') {
    app.use('/', docsRouter);
  }

  // Route → Controller → Service → Repository → PostgreSQL.
  // Wired here (composition root) so handlers stay constructible in tests.
  const urlService = new UrlService(
    new UrlRepository(db),
    deps.cache ?? new UrlCache(getRedis()),
    deps.emitter ?? new OutboxClickEmitter(new OutboxRepository(db)),
    new ClickEventRepository(db),
    new AuthRepository(db),
  );
  const urlsController = createUrlsController(urlService);
  const authService = new AuthService(new AuthRepository(db));
  const authenticate = requireAuth(authService);
  const identify = optionalAuth(authService);
  const authController = createAuthController(authService);

  const credentialLimiter = createRateLimiter({
    windowSeconds: 60,
    maxRequests: 10,
    keyPrefix: 'auth:credentials',
  });
  app.use(
    '/api/v1/auth',
    createAuthRouter(authController, {
      credentialsLimiter: credentialLimiter,
      requireAuth: authenticate,
    }),
  );

  // Write-path protection. /health and redirects stay unlimited (liveness
  // and the counting path must never 429); POST and DELETE share one write
  // budget (both are abuse-relevant). All read GETs share the read budget
  // below so dashboards never consume (or get blocked by) writes.
  const createLimiter =
    deps.rateLimiter !== undefined
      ? deps.rateLimiter
      : createRateLimiter({
          windowSeconds: env.RATE_LIMIT_WINDOW,
          maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
          keyPrefix: 'urls:write',
        });
  const urlsRouter = createUrlsRouter(urlsController);
  // Read GETs mount BEFORE the write-limited router under the shared read
  // namespace (dashboards + management). Express matches in registration
  // order: an app.use(path, limiter, router) claims every sub-path, so a
  // route registered after it can never exempt itself. Registration order
  // IS the exemption mechanism (M13 lesson, applied to all reads).
  const readLimiter = createRateLimiter({
    windowSeconds: env.RATE_LIMIT_WINDOW,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    keyPrefix: 'urls:read',
  });
  // Create-path budget, split by identity AFTER optionalAuth has run:
  // accounts share the write budget; anonymous creates get a strict
  // anti-abuse bucket (guest endpoints mint database rows for strangers).
  const guestCreateLimiter =
    deps.guestRateLimiter !== undefined
      ? deps.guestRateLimiter
      : createRateLimiter({
          windowSeconds: env.GUEST_CREATE_WINDOW_SECONDS,
          maxRequests: env.GUEST_CREATE_MAX_REQUESTS,
          keyPrefix: 'urls:guest-create',
        });
  const createBudget: RequestHandler = (req, res, next) => {
    if (req.userId !== undefined) {
      if (createLimiter === null) {
        next();
        return;
      }
      createLimiter(req, res, next);
      return;
    }
    if (guestCreateLimiter === null) {
      next();
      return;
    }
    guestCreateLimiter(req, res, next);
  };
  // Create + claim mount BEFORE the shared router: Express matches in
  // registration order and these two need different gates than the rest.
  app.post('/api/v1/urls', identify, createBudget, urlsController.createUrl);
  app.post('/api/v1/urls/claim', readLimiter, authenticate, urlsController.claimGuestLinks);
  app.get('/api/v1/urls', readLimiter, authenticate, urlsController.listUrls);
  app.get('/api/v1/urls/:shortCode', readLimiter, authenticate, urlsController.getUrlDetails);
  app.get(
    '/api/v1/urls/:shortCode/analytics',
    readLimiter,
    authenticate,
    urlsController.getAnalytics,
  );
  app.use('/api/v1/stats', readLimiter, authenticate, createStatsRouter(urlsController));
  if (createLimiter !== null) {
    app.use('/api/v1/urls', createLimiter, authenticate, urlsRouter);
  } else {
    app.use('/api/v1/urls', authenticate, urlsRouter);
  }

  // Root: basic API info so GET / doesn't 404.
  app.get('/', (_req, res) => {
    res.json({
      name: 'Shortly API',
      version: '1.0.0',
      health: '/health',
      ready: '/ready',
      metrics: '/metrics',
      docs: env.NODE_ENV !== 'production' ? '/docs' : undefined,
    });
  });

  // ORDERING INVARIANT: the redirect router matches any single-segment GET
  // path, so it must be registered AFTER /health, /api/* (and later
  // /ready, /metrics in M14) — Express matches in registration order.
  app.use('/', createRedirectRouter(urlsController));

  return { app, urlService, requireAuth: authenticate };
}

/**
 * Register the 404 catch-all and central error handler.
 * Called from server.ts AFTER all routes (including SSE) are mounted,
 * so routes added post-createApp() are reachable.
 * Tests can call this too if they need 404 handling.
 */
export function registerFallback(app: Application): void {
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
    if (err instanceof BadRequestError) {
      res.status(err.status).json({
        // Machine-readable code when present (e.g. GUEST_TOKEN_INVALID) so
        // clients can react programmatically instead of matching messages.
        error: err.code ?? 'BadRequest',
        message: err.message,
      });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(err.status).json({ error: 'NotFound', message: err.message });
      return;
    }
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ error: 'Unauthorized', message: err.message });
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
    if (err instanceof ServiceUnavailableError || isDatabaseUnavailable(err)) {
      const message =
        err instanceof ServiceUnavailableError ? err.message : 'Service temporarily unavailable.';
      res.status(503).json({ error: 'ServiceUnavailable', message });
      return;
    }
    res.status(500).json({ error: 'InternalServerError', message: 'Internal Server Error' });
  });
}
