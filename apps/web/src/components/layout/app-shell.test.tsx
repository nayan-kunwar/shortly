import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

let pathname = '/dashboard';

const authState = {
  user: null as { id: string; email: string } | null,
  isLoading: false,
  claimedCount: 0,
  dismissClaimNotice: () => undefined,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
};

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('../../features/auth/auth-context', () => ({
  useAuth: () => authState,
}));

describe('AppShell auth gating', () => {
  it('renders /create without the guard for guests', () => {
    pathname = '/create';
    authState.user = null;
    authState.isLoading = false;
    render(
      <AppShell>
        <p>create page</p>
      </AppShell>,
    );
    expect(screen.getByText('create page')).toBeTruthy();
    expect(screen.queryByText('Checking session…')).toBeNull();
  });

  it('still guards /dashboard for guests', () => {
    pathname = '/dashboard';
    authState.user = null;
    authState.isLoading = false;
    render(
      <AppShell>
        <p>dashboard page</p>
      </AppShell>,
    );
    expect(screen.queryByText('dashboard page')).toBeNull();
    expect(screen.getByText('Checking session…')).toBeTruthy();
  });

  it('renders guarded pages for signed-in users', () => {
    pathname = '/dashboard';
    authState.user = { id: 'u1', email: 'a@x.com' };
    authState.isLoading = false;
    render(
      <AppShell>
        <p>dashboard page</p>
      </AppShell>,
    );
    expect(screen.getByText('dashboard page')).toBeTruthy();
  });
});
