import type { NextFunction, Request, Response } from 'express';
import type { UrlService } from '../services/url.service.js';
import { createUrlSchema } from '../validators/url.validator.js';

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
        const { originalUrl } = await service.resolveUrl(shortCode);
        res.redirect(302, originalUrl);
      } catch (err) {
        next(err);
      }
    },
  };
}

export type UrlsController = ReturnType<typeof createUrlsController>;
