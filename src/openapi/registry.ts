import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { createUrlSchema, listUrlsQuerySchema } from '../validators/url.validator.js';
import {
  analyticsSchema,
  conflictErrorSchema,
  createdUrlSchema,
  globalStatsSchema,
  goneErrorSchema,
  healthSchema,
  listedUrlSchema,
  notFoundErrorSchema,
  rateLimitErrorSchema,
  readinessSchema,
  unavailableErrorSchema,
  urlListPageSchema,
  validationErrorSchema,
} from './schemas.js';

const registry = new OpenAPIRegistry();

function json(schema: z.ZodTypeAny) {
  return { content: { 'application/json': { schema } } };
}

registry.registerPath({
  method: 'post',
  path: '/api/v1/urls',
  summary: 'Create a short URL',
  request: { body: json(createUrlSchema) },
  responses: {
    201: { description: 'Created', ...json(createdUrlSchema) },
    400: { description: 'Validation error', ...json(validationErrorSchema) },
    409: { description: 'Alias conflict', ...json(conflictErrorSchema) },
    429: { description: 'Rate limited', ...json(rateLimitErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls',
  summary: 'List URLs (keyset page)',
  request: { query: listUrlsQuerySchema },
  responses: {
    200: { description: 'Page of URLs', ...json(urlListPageSchema) },
    400: { description: 'Bad pagination input', ...json(validationErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls/{shortCode}',
  summary: 'URL details with lifetime clicks',
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    200: { description: 'Details', ...json(listedUrlSchema) },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/urls/{shortCode}',
  summary: 'Soft-delete a URL',
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    200: {
      description: 'Deactivated',
      ...json(z.object({ shortCode: z.string(), isActive: z.boolean() })),
    },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/urls/{shortCode}/analytics',
  summary: 'Click analytics dashboard payload',
  request: { params: z.object({ shortCode: z.string() }) },
  responses: {
    200: { description: 'Analytics', ...json(analyticsSchema) },
    404: { description: 'Unknown code', ...json(notFoundErrorSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/stats',
  summary: 'Global dashboard totals',
  responses: {
    200: { description: 'Totals', ...json(globalStatsSchema) },
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

export function buildOpenApiDocument() {
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
