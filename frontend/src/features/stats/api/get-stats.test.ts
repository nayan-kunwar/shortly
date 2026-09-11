import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStats } from './get-stats';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStats', () => {
  it('fetches global totals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ totalUrls: 12, activeUrls: 10, totalClicks: 99, clicksToday: 4 }),
      })),
    );
    const stats = await getStats();
    expect(stats).toEqual({ totalUrls: 12, activeUrls: 10, totalClicks: 99, clicksToday: 4 });
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/v1/stats');
  });
});
