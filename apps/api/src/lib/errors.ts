/**
 * Error carrying an HTTP status code and a stable machine-readable code.
 */
export class HttpError extends Error {
  /**
   * Creates an HTTP-facing error.
   *
   * @param statusCode - HTTP status code to return to the caller.
   * @param code - Stable machine-readable error code.
   * @param message - Human-readable error message.
   */
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
