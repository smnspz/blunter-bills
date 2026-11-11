/** Stable mail error codes. */
export type MailErrorCode = "AUTH_FAILED" | "API_ERROR" | "TRANSPORT_ERROR" | "CONFIG_ERROR";

/** Error raised by mail providers. */
export class MailError extends Error {
  /**
   * Creates a mail provider error.
   *
   * @param message - Human-readable description.
   * @param code - Stable error code.
   * @param status - Upstream HTTP status, when available.
   * @param details - Raw provider payload, when available.
   */
  constructor(
    message: string,
    readonly code: MailErrorCode,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MailError";
  }
}
