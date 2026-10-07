import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * env.ts runs loadEnv() at import, so each case resets modules, sets the
 * relevant process.env, then dynamically imports a fresh copy.
 */
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

async function loadWith(overrides: Record<string, string | undefined>): Promise<unknown> {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      // No-dynamic-delete: process.env keys are dynamic by nature.
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
  return import('../../src/config/env.js');
}

describe('BASE_URL required in production', () => {
  it('accepts production when BASE_URL is set', async () => {
    const mod = (await loadWith({
      NODE_ENV: 'production',
      BASE_URL: 'https://short.example',
    })) as typeof import('../../src/config/env.js');
    expect(mod.env.BASE_URL).toBe('https://short.example');
  });

  it('rejects production when BASE_URL is unset', async () => {
    await expect(
      (async () => loadWith({ NODE_ENV: 'production', BASE_URL: undefined }))(),
    ).rejects.toThrow(/BASE_URL is required when NODE_ENV=production/);
  });

  it('rejects production when BASE_URL is empty (treated as unset)', async () => {
    await expect(
      (async () => loadWith({ NODE_ENV: 'production', BASE_URL: '' }))(),
    ).rejects.toThrow(/BASE_URL is required when NODE_ENV=production/);
  });

  it('keeps the localhost default outside production', async () => {
    const mod = (await loadWith({
      NODE_ENV: 'development',
      BASE_URL: undefined,
    })) as typeof import('../../src/config/env.js');
    expect(mod.env.BASE_URL).toBe('http://localhost:3000');
  });
});
