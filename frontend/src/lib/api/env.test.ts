import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from './env';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['NEXT_PUBLIC_API_URL'];
});

describe('getApiBaseUrl', () => {
  it('trims trailing slashes to avoid double-slash URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3000///');
    expect(getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('throws a helpful error when unset', () => {
    expect(() => getApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });
});
