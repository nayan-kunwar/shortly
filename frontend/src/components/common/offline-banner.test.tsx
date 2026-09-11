import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './offline-banner';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnline(true);
  vi.unstubAllGlobals();
});

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('warns once when the browser goes offline', () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('alert').textContent).toMatch(/You are offline/);
  });
});
