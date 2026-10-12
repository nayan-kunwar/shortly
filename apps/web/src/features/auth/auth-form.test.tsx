import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toBeTruthy();
  });

  it('masks the password by default', () => {
    render(<AuthForm mode="register" />, { wrapper });
    const password = screen.getByLabelText(/password/i, { selector: 'input' }) as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(screen.getByRole('button', { name: /show password/i })).toBeTruthy();
  });

  it('toggles password visibility without submitting', () => {
    render(<AuthForm mode="login" />, { wrapper });
    const password = screen.getByLabelText(/password/i, { selector: 'input' }) as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: /show password/i });

    // Must be type="button": the toggle sits inside the form, and a
    // submit button here would fire validation on every peek.
    expect(toggle.getAttribute('type')).toBe('button');

    fireEvent.click(toggle);
    expect(password.type).toBe('text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password.type).toBe('password');
  });
});
