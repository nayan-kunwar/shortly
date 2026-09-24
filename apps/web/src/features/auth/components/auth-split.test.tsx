import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthSplit } from './auth-split';

describe('AuthSplit', () => {
  it('renders the kicker, children, and a decorative panel', () => {
    render(
      <AuthSplit kicker="Welcome back">
        <p>form goes here</p>
      </AuthSplit>,
    );
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('form goes here')).toBeTruthy();
    // Decorative panel is hidden from assistive tech.
    const panel = screen.getByText('Short links.', { exact: false }).closest('[aria-hidden]');
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
  });
});
