import { getApiBaseUrl } from './env';
import { recordApiSuccess } from './api-signal';
import { clearToken, getToken } from '../../features/auth/session';
import { getGuestId } from '../../features/auth/guest-store';

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

  get isUnauthorized(): boolean {
    return this.status === 401;
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
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token !== null) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // No session: attach the anonymous ownership anchor so creates land on
    // the guest identity (claimable at signup). Never sent alongside a
    // bearer token — the two identities are mutually exclusive.
    const guestId = getGuestId();
    if (guestId !== null) headers['X-Guest-Token'] = guestId;
  }
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : null,
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
    recordApiSuccess();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('shortly:api-success'));
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json()) as T;
    return data;
  }

  if (!res.ok && res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('shortly:unauthorized'));
    }
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
