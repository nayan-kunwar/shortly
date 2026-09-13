import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordApiSuccess, resetApiSuccess } from '../../lib/api/api-signal';
import { OfflineBanner } from './offline-banner';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnline(true);
  resetApiSuccess();
  vi.unstubAllGlobals();
});

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('warns on offline signal with no successful traffic', () => {
    setOnline(false);
    render(<OfflineBanner />);
    window.dispatchEvent(new Event('offline'));
    expect(screen.getByRole('alert').textContent).toMatch(/unstable/);
  });

  it('dismisses on API success observed after the offline signal', async () => {
    setOnline(false);
    render(<OfflineBanner />);
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByRole('alert')).toBeTruthy();

    window.dispatchEvent(new CustomEvent('shortly:api-success'));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('stays hidden when success predates the mount (no lost evidence)', () => {
    setOnline(false);
    recordApiSuccess();
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });
});
