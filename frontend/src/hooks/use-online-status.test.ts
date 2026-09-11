import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOnlineStatus } from './use-online-status';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

describe('useOnlineStatus', () => {
  it('reflects browser connectivity and follows events', () => {
    setOnline(true);
    const { result, rerender } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    rerender();
    expect(result.current).toBe(false);

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    rerender();
    expect(result.current).toBe(true);
  });
});
