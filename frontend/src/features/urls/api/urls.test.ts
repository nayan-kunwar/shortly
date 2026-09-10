import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteUrl, getUrl, listUrls } from './urls';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

function mockJson(body: unknown, status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('url management api', () => {
  it('passes pagination and search params through', async () => {
    mockJson({ items: [], nextCursor: null }, 200);
    await listUrls({ limit: 2, cursor: 'abc', search: 'git' });
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/v1/urls?limit=2&cursor=abc&search=git');
  });

  it('fetches details and deletes by encoded code', async () => {
    // One stub for both calls: re-stubbing would reset the call history.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ shortCode: 'a b', clicks: 3 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ shortCode: 'a b', isActive: false }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const details = await getUrl('a b');
    expect(details.clicks).toBe(3);
    const [detailUrl] = fetchMock.mock.calls[0] as [string];
    expect(detailUrl).toContain('/api/v1/urls/a%20b');

    const deleted = await deleteUrl('a b');
    expect(deleted.isActive).toBe(false);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('surfaces backend 404s as ShortlyApiError', async () => {
    mockJson({ error: 'NotFound', message: 'Unknown short code: x' }, 404);
    await expect(getUrl('x')).rejects.toMatchObject({ status: 404, code: 'NotFound' });
  });
});
