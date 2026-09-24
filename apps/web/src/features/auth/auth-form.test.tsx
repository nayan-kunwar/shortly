import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './auth-context';
import { AuthForm } from './components/auth-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('AuthForm', () => {
  it('renders email and password fields for sign in', () => {
    render(<AuthForm mode="login" />, { wrapper });
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
  });
});
