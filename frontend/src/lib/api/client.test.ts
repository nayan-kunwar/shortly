import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortlyApiError, apiRequest } from './client.js';

const BASE = 'http://localhost:3000';
process.env['NEXT_PUBLIC_API_URL'] = BASE;

function mockFetchOnce(body: unknown, init: { status: number; ok: boolean }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: init.ok,
      status: init.status,
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('returns parsed JSON on success and posts JSON bodies', async () => {
    mockFetchOnce({ shortCode: 'a' }, { status: 201, ok: true });
    const res = await apiRequest<{ shortCode: string }>('/api/v1/urls', {
      method: 'POST',
      body: { url: 'https://example.com' },
    });
    expect(res).toEqual({ shortCode: 'a' });
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('POST');
    expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('maps a 409 Conflict to ShortlyApiError with code and field', async () => {
    mockFetchOnce(
      { error: 'Conflict', message: 'customAlias already exists', field: 'customAlias' },
      { status: 409, ok: false },
    );
    const err = await apiRequest('/api/v1/urls').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShortlyApiError);
    const apiErr = err as ShortlyApiError;
    expect(apiErr.status).toBe(409);
    expect(apiErr.code).toBe('Conflict');
    expect(apiErr.isConflict).toBe(true);
    expect(apiErr.details).toBe('customAlias');
  });

  it('maps network failure to a friendly NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const err = await apiRequest('/health').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShortlyApiError);
    expect((err as ShortlyApiError).code).toBe('NetworkError');
  });
});
