'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/** Light/dark/system toggle. Mount-gated: renders a placeholder until the
 * client theme resolves, so server HTML never mismatches hydrated HTML. */
export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Intentional single re-render: first paint must match the server HTML
  // (no theme class) to avoid hydration mismatch; this is next-themes'
  // documented mount-gating pattern, not derived state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span aria-hidden="true" className="inline-block h-9 w-9" />;
  }

  const active = theme === 'system' ? systemTheme : theme;
  const next = active === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
    >
      {active === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
