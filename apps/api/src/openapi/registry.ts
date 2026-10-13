import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { credentialsSchema } from '../validators/auth.validator.js';
import { createUrlSchema, listUrlsQuerySchema } from '../validators/url.validator.js';
import {
  analyticsSchema,
  authSessionSchema,
  authUserSchema,
  badRequestErrorSchema,
  claimedLinksSchema,
  claimGuestLinksSchema,
  conflictErrorSchema,
  createdUrlSchema,
  globalBreakdownsSchema,
  globalStatsSchema,
  goneErrorSchema,
  healthSchema,
  listedUrlSchema,
  notFoundErrorSchema,
  rateLimitErrorSchema,
  readinessSchema,
  unauthorizedErrorSchema,
  unavailableErrorSchema,
  urlListPageSchema,
  validationErrorSchema,
} from './schemas.js';

const registry = new OpenAPIRegistry();

function json(schema: z.ZodTypeAny) {
  return { content: { 'application/json': { schema } } };
}

const bearer = [{ bearerAuth: [] }];

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  summary: 'Create an account and a session',
  request: { body: json(credentialsSchema) },
  responses: {
    201: { description: 'Registered', ...json(authSessionSchema) },
    400: { description: 'Validation error', ...json(validationErrorSchema) },
    409: { description: 'Email already registered', ...json(conflictErrorSchema) },
    429: { description: 'Rate limited', ...json(rateLimitErrorSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  summary: 'Start a session',
  request: { body: json(credentialsSchema) },
  responses: {
    200: { description: 'Logged in', ...json(authSessionSchema) },
    400: { description: 'Validation error', ...json(validationErrorSchema) },
    401: { description: 'Invalid credentials', ...json(unauthorizedErrorSchema) },
    429: { description: 'Rate limited', ...json(rateLimitErrorSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  summary: 'Delete the current session',
  security: bearer,
  responses: {
    204: { description: 'Logged out' },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  summary: 'Current user',
  security: bearer,
  responses: {
    200: { description: 'Current user', ...json(authUserSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/urls',
  summary: 'Create a short URL (account or anonymous guest)',
  request: {
    body: json(createUrlSchema),
    headers: z.object({ 'X-Guest-Token': z.string().uuid().optional() }),
  },
  responses: {
    201: {
      description: 'Created (guestId present when a guest anchor was minted)',
      ...json(createdUrlSchema),
    },
    400: {
      description: 'Validation error, or guest restriction (see code)',
      ...json(badRequestErrorSchema),
    },
    401: {
      description: 'Present-but-invalid bearer (never downgraded to guest)',
      ...json(unauthorizedErrorSchema),
    },
    409: { description: 'Alias conflict', ...json(conflictErrorSchema) },
    429: { description: 'Rate limited (strict bucket for guests)', ...json(rateLimitErrorSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/urls/claim',
  summary: 'Move a guest identity\u2019s unclaimed links onto the account',
  security: bearer,
  request: { body: json(claimGuestLinksSchema) },
  responses: {
    200: {
      description: 'Claimed codes (empty when nothing moved — idempotent)',
      ...json(claimedLinksSchema),
    },
    400: { description: 'Validation error', ...json(validationErrorSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
    429: { description: 'Rate limited', ...json(rateLimitErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls',
  summary: 'List URLs (keyset page)',
  security: bearer,
  request: { query: listUrlsQuerySchema },
  responses: {
    200: { description: 'Page of URLs', ...json(urlListPageSchema) },
    400: { description: 'Bad pagination input', ...json(validationErrorSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls/{shortCode}',
  summary: 'URL details with lifetime clicks',
  security: bearer,
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    200: { description: 'Details', ...json(listedUrlSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/urls/{shortCode}',
  summary: 'Soft-delete a URL',
  security: bearer,
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    200: {
      description: 'Deactivated',
      ...json(z.object({ shortCode: z.string(), isActive: z.boolean() })),
    },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls/{shortCode}/analytics',
  summary: 'Click analytics dashboard payload',
  security: bearer,
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    200: { description: 'Analytics', ...json(analyticsSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls/{shortCode}/analytics/stream',
  summary: 'Live analytics over Server-Sent Events (owner-only)',
  description:
    'Authenticated fetch stream, NOT EventSource — the browser cannot attach ' +
    'headers to EventSource, so the Bearer token rides on a fetch() and the ' +
    'body is read as text/event-stream. Frames are `event: <type>` / ' +
    '`data: <json>` pairs, terminated by a blank line. Server sends a ' +
    '`:ping` comment every 20s to keep proxies from idling the socket.',
  security: bearer,
  request: {
    params: z.object({ shortCode: z.string() }),
    headers: z.object({ Accept: z.string().default('text/event-stream') }),
  },
  responses: {
    200: {
      description:
        'Stream open. Body stays open until the client disconnects; it never returns a JSON payload.',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
    404: {
      description: 'Unknown code, or not owned by the caller — the owner check is not optional',
      ...json(notFoundErrorSchema),
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/stats',
  summary: 'Global dashboard totals',
  security: bearer,
  responses: {
    200: { description: 'Totals', ...json(globalStatsSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/stats/breakdowns',
  summary: 'Global country/device/browser/referrer breakdowns',
  security: bearer,
  responses: {
    200: { description: 'Breakdowns', ...json(globalBreakdownsSchema) },
    401: { description: 'Missing or invalid session', ...json(unauthorizedErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/{shortCode}',
  summary: 'Redirect to the original URL',
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    302: { description: 'Found — follow Location' },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
    410: { description: 'Deactivated or expired', ...json(goneErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Liveness probe (no dependency checks)',
  responses: { 200: { description: 'Alive', ...json(healthSchema) } },
});

registry.registerPath({
  method: 'get',
  path: '/ready',
  summary: 'Readiness probe (checks PG, Redis, RabbitMQ)',
  responses: {
    200: { description: 'Ready', ...json(readinessSchema) },
    503: { description: 'A dependency is down', ...json(unavailableErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/metrics',
  summary: 'Prometheus exposition',
  responses: { 200: { description: 'Metrics in text format' } },
});

export function buildOpenApiDocument(): object {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Shortly URL Shortener API',
      version: '1.0.0',
      description:
        'Production-oriented Bitly-like service. Generated from the same Zod schemas that validate requests — the contract cannot drift from validation.',
    },
    servers: [{ url: 'http://localhost:3000' }],
  });
}
