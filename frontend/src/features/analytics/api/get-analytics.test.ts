import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAnalytics } from './get-analytics';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAnalytics', () => {
  it('fetches the dashboard payload by encoded code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ shortCode: 'a1', totalClicks: 5, clicksByDay: [] }),
      })),
    );
    const data = await getAnalytics('a1');
    expect(data.totalClicks).toBe(5);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/v1/urls/a1/analytics');
  });

  it('surfaces 404s for unknown codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'NotFound', message: 'Unknown short code: x' }),
      })),
    );
    await expect(getAnalytics('x')).rejects.toMatchObject({ status: 404 });
  });
});
