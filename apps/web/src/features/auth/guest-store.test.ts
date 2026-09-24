import { afterEach, describe, expect, it } from 'vitest';
import { clearGuestId, getGuestId, setGuestId } from './guest-store';

afterEach(() => {
  localStorage.removeItem('shortly.guest');
});

describe('guest-store', () => {
  it('round-trips the guest anchor and clears it', () => {
    expect(getGuestId()).toBeNull();
    setGuestId('11111111-2222-3333-4444-555555555555');
    expect(getGuestId()).toBe('11111111-2222-3333-4444-555555555555');
    clearGuestId();
    expect(getGuestId()).toBeNull();
  });
});
