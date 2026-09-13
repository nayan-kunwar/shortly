import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

// @testing-library/react auto-registers cleanup only when test globals exist.
// We run with globals:false, so wire it explicitly.
afterEach(() => {
  cleanup();
});

beforeAll(() => {
  // jsdom has no matchMedia; next-themes (system theme) requires it.
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
  // jsdom has no ResizeObserver; Recharts ResponsiveContainer requires it.
  if (typeof window.ResizeObserver !== 'function') {
    class ResizeObserverStub implements ResizeObserver {
      observe(): void {
        // Intentional no-op test double.
      }
      unobserve(): void {
        // Intentional no-op test double.
      }
      disconnect(): void {
        // Intentional no-op test double.
      }
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverStub,
    });
  }
});
