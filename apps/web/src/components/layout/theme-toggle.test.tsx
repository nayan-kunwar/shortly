import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  it('renders a labeled toggle and flips theme on click', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button', { name: /switch to (light|dark) mode/i });
    const before = button.getAttribute('aria-label');
    await user.click(button);
    expect(button.getAttribute('aria-label')).not.toBe(before);
  });
});
