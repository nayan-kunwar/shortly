/**
 * A uniqueness conflict on a short code or custom alias.
 * Thrown by the repository (which owns SQL knowledge) so upper layers can
 * answer 409 without importing pg error codes.
 */
export class ConflictError extends Error {
  readonly status = 409;

  constructor(
    readonly field: 'shortCode' | 'customAlias',
    message?: string,
  ) {
    super(message ?? `${field} already exists`);
    this.name = 'ConflictError';
  }
}
