import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandingNavbar } from './landing-navbar';

const authState = {
  user: null as { id: string; email: string } | null,
  isLoading: false,
  claimedCount: 0,
  dismissClaimNotice: () => undefined,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
};

vi.mock('../../features/auth/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('LandingNavbar', () => {
  it('shows only sign-in entry points to guests', () => {
    authState.user = null;
    authState.isLoading = false;
    render(<LandingNavbar />);
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /get started/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'My URLs' })).toBeNull();
  });

  it('shows app links and the account menu when signed in', () => {
    authState.user = { id: 'u1', email: 'a@x.com' };
    authState.isLoading = false;
    render(<LandingNavbar />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'My URLs' })).toBeTruthy();
    expect(screen.getByText('a@x.com')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /get started/i })).toBeNull();
  });
});
