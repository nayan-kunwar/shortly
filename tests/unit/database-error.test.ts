import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailable, ServiceUnavailableError } from '../../src/errors/database-error.js';

function systemError(code: string): Error {
  const err = new Error(`connect ${code} 127.0.0.1:5432`);
  (err as { code: string }).code = code;
  return err;
}

describe('isDatabaseUnavailable', () => {
  it('matches connection-level failures', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH']) {
      expect(isDatabaseUnavailable(systemError(code))).toBe(true);
    }
    expect(isDatabaseUnavailable(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isDatabaseUnavailable({ code: '57P01' })).toBe(true);
  });

  it('sees through Drizzle-style cause chains', () => {
    const wrapped = new Error('Failed query: select * from urls') as Error & { cause?: unknown };
    wrapped.cause = systemError('ECONNREFUSED');
    expect(isDatabaseUnavailable(wrapped)).toBe(true);
  });

  it('rejects query-level and generic errors (never 503 these)', () => {
    expect(isDatabaseUnavailable({ code: '42601', message: 'syntax error' })).toBe(false);
    expect(isDatabaseUnavailable({ code: '23505', constraint: 'x' })).toBe(false);
    expect(isDatabaseUnavailable(new Error('boom'))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable('ECONNREFUSED')).toBe(false);
  });
});

describe('ServiceUnavailableError', () => {
  it('carries 503 status', () => {
    expect(new ServiceUnavailableError().status).toBe(503);
  });
});
