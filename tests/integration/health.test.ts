import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 404 for unknown routes (Express 5 fallback)', async () => {
    const app = createApp();
    const res = await request(app).get('/definitely-not-here');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'NotFound' });
  });

  it('echoes ACAO for the configured dev origin only', async () => {
    const app = createApp();
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:3001');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');

    const denied = await request(app).get('/health').set('Origin', 'http://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
