import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeRedis } from '../../src/redis/client.js';
import { afterAll } from 'vitest';

afterAll(async () => {
  await closeRedis();
});

interface OpenApiDoc {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
}

const EXPECTED_ROUTES: [string, string][] = [
  ['/api/v1/urls', 'post'],
  ['/api/v1/urls', 'get'],
  ['/api/v1/urls/{shortCode}', 'get'],
  ['/api/v1/urls/{shortCode}', 'delete'],
  ['/api/v1/urls/{shortCode}/analytics', 'get'],
  ['/api/v1/stats', 'get'],
  ['/{shortCode}', 'get'],
  ['/health', 'get'],
  ['/ready', 'get'],
  ['/metrics', 'get'],
];

describe('openapi contract', () => {
  it('serves a valid 3.0 spec covering every route', async () => {
    const app = createApp();
    const res = await request(app).get('/docs.json');
    expect(res.status).toBe(200);
    const doc = res.body as OpenApiDoc;
    expect(doc.openapi).toMatch(/^3\.0\./);
    for (const [path, method] of EXPECTED_ROUTES) {
      expect(doc.paths[path], `missing path ${path}`).toBeDefined();
      expect(doc.paths[path]?.[method], `missing ${method.toUpperCase()} ${path}`).toBeDefined();
    }
  });

  it('serves the Swagger UI explorer', async () => {
    const app = createApp();
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('derives the create schema from the live validator (no drift)', async () => {
    const app = createApp();
    const res = await request(app).get('/docs.json');
    const post = (
      res.body as {
        paths: Record<
          string,
          Record<
            string,
            { requestBody?: { content?: { 'application/json'?: { schema?: unknown } } } }
          >
        >;
      }
    ).paths['/api/v1/urls']?.['post'];
    // Inline-generated from createUrlSchema: url required, exactly as validation enforces.
    expect(post?.requestBody?.content?.['application/json']?.schema).toMatchObject({
      required: ['url'],
    });
  });
});
