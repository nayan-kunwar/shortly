import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortlyApiError, apiRequest } from './client';

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

  it('sends the bearer token from sessionStorage', async () => {
    sessionStorage.setItem('shortly.session', 'tok-1');
    mockFetchOnce({ ok: true }, { status: 200, ok: true });
    await apiRequest('/api/v1/auth/me');
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok-1' });
    sessionStorage.removeItem('shortly.session');
  });

  it('sends the guest anchor when there is no session, never alongside a bearer', async () => {
    localStorage.setItem('shortly.guest', 'guest-1');
    mockFetchOnce({ ok: true }, { status: 200, ok: true });
    await apiRequest('/api/v1/urls', { method: 'POST', body: { url: 'https://example.com' } });
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(opts.headers).toMatchObject({ 'X-Guest-Token': 'guest-1' });
    expect(opts.headers).not.toHaveProperty('Authorization');
    localStorage.removeItem('shortly.guest');
  });

  it('prefers the bearer token over the guest anchor', async () => {
    sessionStorage.setItem('shortly.session', 'tok-1');
    localStorage.setItem('shortly.guest', 'guest-1');
    mockFetchOnce({ ok: true }, { status: 200, ok: true });
    await apiRequest('/api/v1/urls', { method: 'POST', body: { url: 'https://example.com' } });
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer tok-1' });
    expect(opts.headers).not.toHaveProperty('X-Guest-Token');
    sessionStorage.removeItem('shortly.session');
    localStorage.removeItem('shortly.guest');
  });

  it('clears the session when the API answers 401', async () => {
    sessionStorage.setItem('shortly.session', 'stale');
    mockFetchOnce({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401, ok: false });
    await apiRequest('/api/v1/auth/me').catch((e: unknown) => e);
    expect(sessionStorage.getItem('shortly.session')).toBeNull();
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

  it('dispatches api-success evidence on 2xx for the offline banner', async () => {
    const seen: string[] = [];
    window.addEventListener('shortly:api-success', () => seen.push('success'));
    mockFetchOnce({ status: 'ok' }, { status: 200, ok: true });
    await apiRequest('/health');
    expect(seen).toHaveLength(1);
  });

  it('aborts hung requests with a friendly TimeoutError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              reject(new DOMException('signal timed out', 'TimeoutError'));
            });
          }),
      ),
    );
    const err = await apiRequest('/health', { timeoutMs: 50 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShortlyApiError);
    expect((err as ShortlyApiError).code).toBe('TimeoutError');
    expect((err as ShortlyApiError).message).toBe('Request timed out. Please try again.');
  });
});
