import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../errors/not-found-error.js';
import { redirectRequestsTotal, urlCreationTotal } from '../observability/http-metrics.js';
import type { UrlService } from '../services/url.service.js';
import { createUrlSchema, listUrlsQuerySchema } from '../validators/url.validator.js';

const shortCodeParams = z.object({
  shortCode: z.string().min(1).max(64),
});

/**
 * Controller: HTTP in/out only. Parses with Zod (throws ZodError → 400 via
 * the central error handler), delegates to the service, answers 201.
 * Errors go to next(err) explicitly (Express 5 would also forward async
 * rejections on its own; explicit is version-proof and readable).
 */
export function createUrlsController(service: UrlService) {
  return {
    async createUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const input = createUrlSchema.parse(req.body);
        const result = await service.createShortUrl(input);
        urlCreationTotal.inc();
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },

    /**
     * GET /:shortCode. 302 + Location on success; 404/410 via the error
     * handler. 302 (not 301): links are temporary by design (they can
     * expire/deactivate), and every click must reach us for counting.
     */
    async redirect(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const shortCode = req.params['shortCode'];
        if (typeof shortCode !== 'string' || shortCode.length === 0) {
          res.status(404).json({ error: 'NotFound', message: 'Missing short code' });
          return;
        }
        const { originalUrl } = await service.resolveUrl(shortCode, {
          // HTTP-layer facts in, sanitized event out: the service builds the
          // event via buildClickEvent (IP anonymized, referer stripped).
          ip: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
          referer: req.get('referer') ?? null,
        });
        redirectRequestsTotal.inc();
        res.redirect(302, originalUrl);
      } catch (err) {
        next(err);
      }
    },

    /**
     * DELETE /api/v1/urls/:shortCode. Soft delete via the service (which
     * also invalidates the cache). 200 + state (not 204: this API answers
     * JSON everywhere, and the body confirms the resulting state).
     * Idempotent: deleting an already-inactive code still answers 200 —
     * the end state is identical. Unknown codes answer 404.
     */
    async deleteUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { shortCode } = shortCodeParams.parse(req.params);
        const row = await service.deactivateUrl(shortCode);
        if (row === null) {
          throw new NotFoundError(`Unknown short code: ${shortCode}`);
        }
        res.status(200).json({ shortCode: row.shortCode, isActive: row.isActive });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/v1/urls/:shortCode/analytics. 200 dashboard payload, 404 unknown. */
    async getAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { shortCode } = shortCodeParams.parse(req.params);
        res.status(200).json(await service.getUrlAnalytics(shortCode));
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/v1/stats. Global dashboard totals, no params. */
    async getGlobalStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        res.status(200).json(await service.getGlobalStats());
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/v1/urls (keyset page). Query validated, 400 on garbage. */
    async listUrls(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const query = listUrlsQuerySchema.parse(req.query);
        res.status(200).json(await service.listUrls(query));
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/v1/urls/:shortCode. 200 details, 404 unknown. */
    async getUrlDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { shortCode } = shortCodeParams.parse(req.params);
        res.status(200).json(await service.getUrlDetails(shortCode));
      } catch (err) {
        next(err);
      }
    },
  };
}

export type UrlsController = ReturnType<typeof createUrlsController>;
