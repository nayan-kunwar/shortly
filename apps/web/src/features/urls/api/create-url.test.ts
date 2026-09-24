import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortlyApiError } from '../../../lib/api/client';
import { createUrl } from './create-url';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('shortly.guest');
});

function mockFetchOnce(body: unknown, status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })),
  );
}

describe('createUrl', () => {
  it('persists a minted guest anchor from the response', async () => {
    mockFetchOnce(
      { shortCode: 'a1', shortUrl: 'http://localhost:3000/a1', originalUrl: 'https://example.com', guestId: 'guest-9' },
      201,
    );
    const res = await createUrl({ url: 'https://example.com' });
    expect(res.guestId).toBe('guest-9');
    expect(localStorage.getItem('shortly.guest')).toBe('guest-9');
  });

  it('clears a corrupt anchor and retries once', async () => {
    localStorage.setItem('shortly.guest', 'corrupt');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'GUEST_TOKEN_INVALID', message: 'Guest session is invalid' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ shortCode: 'b2', shortUrl: 'http://localhost:3000/b2', originalUrl: 'https://example.com', guestId: 'guest-10' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const res = await createUrl({ url: 'https://example.com' });
    expect(res.shortCode).toBe('b2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('shortly.guest')).toBe('guest-10');
  });

  it('propagates a second failure instead of retrying forever', async () => {
    localStorage.setItem('shortly.guest', 'corrupt');
    mockFetchOnce({ error: 'GUEST_TOKEN_INVALID', message: 'Guest session is invalid' }, 400);
    const err = await createUrl({ url: 'https://example.com' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShortlyApiError);
    // Anchor cleared so the next attempt starts clean.
    expect(localStorage.getItem('shortly.guest')).toBeNull();
  });
});
