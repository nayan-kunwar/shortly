import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NAV_ITEMS, NavLinks } from './nav-links';

// next/navigation is server-wired; mock the one hook we consume.
vi.mock('next/navigation', () => ({
  usePathname: () => '/urls',
}));

describe('NavLinks', () => {
  it('renders every nav item with correct hrefs', () => {
    render(<NavLinks />);
    for (const item of NAV_ITEMS) {
      const link = screen.getByRole('link', { name: item.label });
      expect(link.getAttribute('href')).toBe(item.href);
    }
  });

  it('marks only the current section active', () => {
    render(<NavLinks />);
    expect(screen.getByRole('link', { name: 'My URLs' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
  });
});
