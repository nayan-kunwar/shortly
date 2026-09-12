import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Must run before any `.openapi()` call in this module (ESM evaluates
// imports before the importer's body — calling it in registry.ts is too late).
extendZodWithOpenApi(z);

/** Response + error envelopes. Field shapes mirror the service layer. */

export const createdUrlSchema = z
  .object({
    shortCode: z.string(),
    shortUrl: z.string().url(),
    originalUrl: z.string().url(),
  })
  .openapi('CreatedUrl');

export const listedUrlSchema = z
  .object({
    shortCode: z.string(),
    shortUrl: z.string().url(),
    originalUrl: z.string(),
    customAlias: z.string().nullable(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    isActive: z.boolean(),
    clicks: z.number().int(),
  })
  .openapi('ListedUrl');

export const urlListPageSchema = z
  .object({
    items: z.array(listedUrlSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi('UrlListPage');

export const analyticsSchema = z
  .object({
    shortCode: z.string(),
    totalClicks: z.number().int(),
    clicksByDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
    countries: z.record(z.number().int()),
    devices: z.record(z.number().int()),
    browsers: z.record(z.number().int()),
    referrers: z.record(z.number().int()),
  })
  .openapi('UrlAnalytics');

export const globalStatsSchema = z
  .object({
    totalUrls: z.number().int(),
    activeUrls: z.number().int(),
    totalClicks: z.number().int(),
    clicksToday: z.number().int(),
  })
  .openapi('GlobalStats');

export const healthSchema = z
  .object({
    status: z.string(),
    uptime: z.number(),
    env: z.string(),
    instance: z.string(),
  })
  .openapi('Health');

export const readinessSchema = z
  .object({
    status: z.enum(['ready', 'not-ready']),
    checks: z.object({
      postgres: z.object({ ok: z.boolean() }),
      redis: z.object({ ok: z.boolean() }),
      rabbitmq: z.object({ ok: z.boolean() }),
    }),
  })
  .openapi('Readiness');

export const shortCodeParamSchema = z
  .object({ shortCode: z.string().min(1).max(64) })
  .openapi('ShortCodeParams');

function errorEnvelope(code: string, extra: Record<string, z.ZodTypeAny> = {}) {
  return z.object({ error: z.string(), message: z.string(), ...extra }).openapi(code);
}

export const validationErrorSchema = errorEnvelope('ValidationError', {
  details: z.array(z.object({ path: z.string(), message: z.string() })),
});
export const conflictErrorSchema = errorEnvelope('ConflictError', { field: z.string() });
export const notFoundErrorSchema = errorEnvelope('NotFoundError');
export const goneErrorSchema = errorEnvelope('GoneError', { reason: z.string() });
export const rateLimitErrorSchema = errorEnvelope('TooManyRequestsError');
export const unavailableErrorSchema = errorEnvelope('ServiceUnavailableError');
