import type { EmailMessage, ReadMessagesOptions } from "./email.js";

/** Port implemented by every mail provider adapter. */
export interface MailReader {
  /** Provider id, e.g. `gmail`. */
  readonly provider: string;
  /**
   * Reads recent messages, including subject and body.
   *
   * @param options - Result limit and provider-specific query.
   * @returns Normalized messages.
   */
  readMessages(options?: ReadMessagesOptions): Promise<EmailMessage[]>;
}
