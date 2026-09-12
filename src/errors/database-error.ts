/**
 * Database-availability classification. PostgreSQL is the source of truth:
 * when it is unreachable, reads and writes cannot be served honestly, so
 * the API answers 503 (retryable, LB-drainable) instead of 500 (bug).
 *
 * Matched narrowly: connection-level failures only. Query errors (syntax,
 * constraint violations like 23505) are application-level and keep their
 * own mapping — a typo must never become a 503.
 */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EPIPE',
  // Admin shutdown / crash recovery.
  '57P01',
  '57P02',
  '57P03',
]);

function isConnectionFailure(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const rec = err as Record<string, unknown>;
  if (typeof rec['code'] === 'string' && UNAVAILABLE_CODES.has(rec['code'])) return true;
  if (typeof rec['message'] === 'string') {
    const msg = rec['message'] as string;
    if (
      msg.includes('Connection terminated') ||
      msg.includes('Connection ended') ||
      msg.includes('timeout exceeded')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Walk the error chain (Drizzle wraps pg errors in `Failed query` with the
 * driver error on `.cause`). True when the database itself is unreachable.
 */
export function isDatabaseUnavailable(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4; depth++) {
    if (isConnectionFailure(current)) return true;
    if (typeof current !== 'object' || current === null) return false;
    const rec = current as Record<string, unknown>;
    if (!('cause' in rec)) return false;
    current = rec['cause'];
  }
  return false;
}

/** 503 error for exhausted dependencies (mapped in the central handler). */
export class ServiceUnavailableError extends Error {
  readonly status = 503;

  constructor(message = 'Service temporarily unavailable. Please try again.') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
