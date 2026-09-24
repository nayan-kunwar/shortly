/** Malformed input that Zod did not catch (e.g. guest-only restrictions). Answers 400. */
export class BadRequestError extends Error {
  readonly status = 400;

  constructor(
    message = 'Bad request',
    readonly code?: string,
  ) {
    super(message);
    this.name = 'BadRequestError';
  }
}
