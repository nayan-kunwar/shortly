import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function Probe() {
  const { claimedCount, login } = useAuth();
  return (
    <div>
      <span>claimed:{claimedCount}</span>
      <button type="button" onClick={() => void login('a@x.com', 'password123')}>
        sign in
      </button>
    </div>
  );
}

function routeFetch(claimImpl: () => { status: number; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const path = String(url);
      if (path.endsWith('/api/v1/auth/login')) {
        return { ok: true, status: 200, json: async () => ({ token: 'tok', user: { id: 'u1', email: 'a@x.com' } }) };
      }
      if (path.endsWith('/api/v1/auth/me')) {
        return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@x.com' }) };
      }
      if (path.endsWith('/api/v1/urls/claim')) {
        const { status, body } = claimImpl();
        if (init?.body !== undefined) {
          const parsed = JSON.parse(init.body) as { guestId?: string };
          expect(parsed.guestId).toBe('guest-1');
        }
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      }
      throw new Error(`unexpected fetch: ${path}`);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('shortly.guest');
  sessionStorage.removeItem('shortly.session');
});

describe('claim on sign-in', () => {
  it('claims the stored guest anchor, clears it, and reports the count', async () => {
    localStorage.setItem('shortly.guest', 'guest-1');
    routeFetch(() => ({ status: 200, body: { claimed: ['abc', 'def'] } }));
    const user = userEvent.setup();
    render(<Probe />, { wrapper });

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('claimed:2')).toBeTruthy());
    expect(localStorage.getItem('shortly.guest')).toBeNull();
  });

  it('keeps the anchor when the claim fails (retry next sign-in)', async () => {
    localStorage.setItem('shortly.guest', 'guest-1');
    routeFetch(() => ({ status: 500, body: { error: 'InternalServerError', message: 'boom' } }));
    const user = userEvent.setup();
    render(<Probe />, { wrapper });

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(sessionStorage.getItem('shortly.session')).toBe('tok'));
    expect(screen.getByText('claimed:0')).toBeTruthy();
    expect(localStorage.getItem('shortly.guest')).toBe('guest-1');
  });

  it('skips the claim when there is no stored anchor', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith('/api/v1/auth/login')) {
        return { ok: true, status: 200, json: async () => ({ token: 'tok', user: { id: 'u1', email: 'a@x.com' } }) };
      }
      if (path.endsWith('/api/v1/auth/me')) {
        return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@x.com' }) };
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Probe />, { wrapper });

    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(sessionStorage.getItem('shortly.session')).toBe('tok'));
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/v1/urls/claim'))).toBe(false);
  });
});
