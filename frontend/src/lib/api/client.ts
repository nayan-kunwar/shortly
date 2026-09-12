import { getApiBaseUrl } from './env';
import { recordApiSuccess } from './api-signal';

/**
 * Typed error mirroring the backend contract (§15, §30 of the frontend spec).
 * `code` is the backend `error` field; `details`/`field`/`reason` pass
 * through for form-level and programmatic handling.
 */
export class ShortlyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ShortlyApiError';
  }

  get isValidation(): boolean {
    return this.status === 400;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isGone(): boolean {
    return this.status === 410;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Abort the request after this many ms (default 15s — fail fast, not hang). */
  timeoutMs?: number;
}

interface BackendErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
  field?: unknown;
  reason?: unknown;
}

/**
 * Centralized fetch wrapper — the only place that talks HTTP (§12).
 * Throws ShortlyApiError on non-2xx; returns parsed JSON otherwise.
 * Every request carries a timeout: a hung network must surface as an
 * error, never an eternal spinner.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = 15_000 } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined =
    signal === undefined
      ? timeoutSignal
      : typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutSignal])
        : signal;
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ShortlyApiError(0, 'TimeoutError', 'Request timed out. Please try again.', err);
    }
    throw new ShortlyApiError(
      0,
      'NetworkError',
      'Unable to connect to Shortly. Please try again.',
      err,
    );
  }

  if (res.ok) {
    const data = (await res.json()) as T;
    // Evidence of connectivity for the offline banner: observed success
    // beats the browser's connectivity signal (which false-positives).
    recordApiSuccess();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('shortly:api-success'));
    }
    return data;
  }

  let parsed: BackendErrorBody = {};
  try {
    parsed = (await res.json()) as BackendErrorBody;
  } catch {
    // Non-JSON error body — fall through to the generic message below.
  }
  throw new ShortlyApiError(
    res.status,
    typeof parsed.error === 'string' ? parsed.error : 'UnknownError',
    typeof parsed.message === 'string'
      ? parsed.message
      : `Request failed with status ${String(res.status)}`,
    parsed.details ?? parsed.field ?? parsed.reason,
  );
}
