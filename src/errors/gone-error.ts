/**
 * Short code exists but is no longer usable (deactivated or expired).
 * Answers 410 Gone — distinct from 404: the client should stop retrying
 * this link rather than treat it as a typo.
 */
export class GoneError extends Error {
  readonly status = 410;

  constructor(
    readonly reason: 'deactivated' | 'expired',
    message?: string,
  ) {
    super(message ?? `URL is no longer available (${reason})`);
    this.name = 'GoneError';
  }
}
