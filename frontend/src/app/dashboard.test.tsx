import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Home from './page';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockRoutes(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      if (typeof url === 'string' && url.endsWith('/api/v1/stats')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ totalUrls: 12, activeUrls: 10, totalClicks: 99, clicksToday: 4 }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: null }),
      };
    }),
  );
}

describe('dashboard', () => {
  it('shows live stats, quick create, and recents', async () => {
    mockRoutes();
    render(<Home />, { wrapper });

    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText('Total URLs')).toBeTruthy();
    expect(screen.getByText('Clicks today')).toBeTruthy();
    expect(screen.getByRole('button', { name: /create short url/i })).toBeTruthy();
    expect(await screen.findByText('No shortened URLs yet.')).toBeTruthy();
  });

  it('shows retry affordances when services fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'InternalServerError', message: 'boom' }),
      })),
    );
    render(<Home />, { wrapper });

    expect(await screen.findByText('Statistics are temporarily unavailable.')).toBeTruthy();
    expect(await screen.findByText('Unable to load recent URLs.')).toBeTruthy();
  });
});
