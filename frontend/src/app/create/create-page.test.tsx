import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CreatePage from './page';
import { Navbar } from '../../components/layout/navbar';
import { ThemeProvider } from '../../components/layout/theme-provider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('create page', () => {
  it('renders the creation form', () => {
    render(<CreatePage />, { wrapper });
    expect(screen.getByRole('heading', { name: /create a short url/i })).toBeTruthy();
    expect(screen.getByLabelText(/original url/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /create short url/i })).toBeTruthy();
  });
});

describe('navbar', () => {
  it('renders brand and navigation', () => {
    render(<Navbar />, { wrapper });
    expect(screen.getByRole('link', { name: 'Shortly' })).toBeTruthy();
  });
});
