/** Short code resolves to nothing. Answers 404. */
export class NotFoundError extends Error {
  readonly status = 404;

  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}
