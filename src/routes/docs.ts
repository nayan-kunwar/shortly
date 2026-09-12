import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../openapi/registry.js';

export const docsRouter = Router();

// Raw spec (machine-readable contract; the contract test pins it).
docsRouter.get('/docs.json', (_req: Request, res: Response) => {
  res.status(200).json(buildOpenApiDocument());
});

// Interactive explorer. Development only — production serves no docs UI.
docsRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument()));
