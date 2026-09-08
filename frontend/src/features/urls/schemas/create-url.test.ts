import { describe, expect, it } from 'vitest';
import { createUrlSchema } from './create-url.js';

describe('createUrlSchema (frontend mirror — must never be looser than backend)', () => {
  it('accepts http(s) URLs with optional alias and future expiry', () => {
    const parsed = createUrlSchema.parse({
      url: 'https://example.com/long',
      customAlias: 'github',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(parsed.url).toBe('https://example.com/long');
  });

  it('rejects non-http URLs, bad aliases, and past expiries', () => {
    expect(() => createUrlSchema.parse({ url: 'ftp://example.com/x' })).toThrow();
    expect(() => createUrlSchema.parse({ url: 'not-a-url' })).toThrow();
    expect(() =>
      createUrlSchema.parse({ url: 'https://example.com', customAlias: 'has space' }),
    ).toThrow();
    expect(() =>
      createUrlSchema.parse({
        url: 'https://example.com',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).toThrow();
  });
});
