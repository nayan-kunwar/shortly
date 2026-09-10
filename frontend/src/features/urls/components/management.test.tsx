import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DeactivateButton } from './deactivate-button';
import { UrlTable } from './url-table';
import type { UrlListItem } from '../types';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const item: UrlListItem = {
  shortCode: 'a1',
  shortUrl: 'http://localhost:3000/a1',
  originalUrl: 'https://example.com',
  customAlias: null,
  createdAt: new Date().toISOString(),
  expiresAt: null,
  isActive: true,
  clicks: 7,
};

describe('UrlTable', () => {
  it('renders rows and an honest empty state', () => {
    const { rerender } = render(<UrlTable items={[item]} />);
    expect(screen.getByText('http://localhost:3000/a1')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();

    rerender(<UrlTable items={[]} />);
    expect(screen.getByText('No shortened URLs yet.')).toBeTruthy();
  });
});

describe('DeactivateButton', () => {
  it('requires two clicks and calls DELETE once', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ shortCode: 'a1', isActive: false }),
      })),
    );
    render(<DeactivateButton shortCode="a1" />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm deactivate' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Confirm deactivate' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Deactivated.')).toBeTruthy();
  });
});
