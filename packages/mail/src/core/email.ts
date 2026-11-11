/** Normalized email message returned by a mail reader. */
export interface EmailMessage {
  /** Provider id, e.g. `gmail`. */
  provider: string;
  /** Provider-specific message id. */
  id: string;
  /** Provider thread id, when available. */
  threadId: string | null;
  /** Decoded subject line. */
  subject: string;
  /** Best-effort plain-text body. */
  body: string;
  /** Raw `From` header. */
  from: string | null;
  /** Raw `To` header entries. */
  to: string[];
  /** ISO 8601 timestamp, or null when unavailable. */
  receivedAt: string | null;
  /** Provider snippet, when available. */
  snippet: string | null;
}

/** Options accepted by {@link MailReader.readMessages}. */
export interface ReadMessagesOptions {
  /** Maximum number of messages to return. */
  maxResults?: number;
  /** Provider-specific search query, e.g. a Gmail search expression. */
  query?: string;
}
