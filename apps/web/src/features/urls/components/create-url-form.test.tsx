import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CreateUrlForm } from './create-url-form';

process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3000';

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<CreateUrlForm />, { wrapper });
}

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

describe('CreateUrlForm', () => {
  it('shows client-side errors for empty and invalid URLs', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderForm();

    await user.click(screen.getByRole('button', { name: /create short url/i }));
    expect(await screen.findByText('Please enter a URL.')).toBeTruthy();

    await user.type(screen.getByLabelText(/original url/i), 'not-a-url');
    await user.click(screen.getByRole('button', { name: /create short url/i }));
    expect(await screen.findByText('Please enter a valid http(s) URL.')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates a URL and shows the success state with copy', async () => {
    const user = userEvent.setup();
    mockJson(
      { shortCode: 'a1', shortUrl: 'http://localhost:3000/a1', originalUrl: 'https://example.com' },
      201,
    );
    renderForm();

    await user.type(screen.getByLabelText(/original url/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /create short url/i }));

    expect(await screen.findByText('URL created successfully')).toBeTruthy();
    expect(screen.getByText('http://localhost:3000/a1')).toBeTruthy();
  });

  it('maps a 409 to the alias field error', async () => {
    const user = userEvent.setup();
    mockJson({ error: 'Conflict', message: 'taken', field: 'customAlias' }, 409);
    renderForm();

    await user.type(screen.getByLabelText(/original url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/custom alias/i), 'taken');
    await user.click(screen.getByRole('button', { name: /create short url/i }));

    expect(await screen.findByText('This custom alias is already in use.')).toBeTruthy();
  });

  it('maps a 429 to the rate-limit message', async () => {
    const user = userEvent.setup();
    mockJson({ error: 'TooManyRequests', message: 'slow down' }, 429);
    renderForm();

    await user.type(screen.getByLabelText(/original url/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /create short url/i }));

    expect(await screen.findByText('Too many requests. Please try again later.')).toBeTruthy();
  });

  it('shows a root error when the backend is unreachable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    renderForm();

    await user.type(screen.getByLabelText(/original url/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /create short url/i }));

    await waitFor(() => {
      expect(screen.getByText('Unable to connect to Shortly. Please try again.')).toBeTruthy();
    });
  });
});
