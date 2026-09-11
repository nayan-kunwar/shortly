import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UrlStatusBadge } from './url-status-badge';

describe('UrlStatusBadge', () => {
  it('shows Active for live links', () => {
    render(<UrlStatusBadge isActive={true} expiresAt={null} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows Inactive for deactivated links', () => {
    render(<UrlStatusBadge isActive={false} expiresAt={null} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('shows Expired past expiry even when active', () => {
    render(
      <UrlStatusBadge isActive={true} expiresAt={new Date(Date.now() - 1000).toISOString()} />,
    );
    expect(screen.getByText('Expired')).toBeTruthy();
  });
});
