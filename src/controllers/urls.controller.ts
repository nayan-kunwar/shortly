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
  };
}

export type UrlsController = ReturnType<typeof createUrlsController>;
