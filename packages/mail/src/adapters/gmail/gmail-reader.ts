import type { AccessTokenProvider } from "../../core/access-token.js";
import type { EmailMessage, ReadMessagesOptions } from "../../core/email.js";
import { MailError } from "../../core/errors.js";
import type { MailReader } from "../../core/mail-reader.js";
import { parseJson } from "../../lib/parse-json.js";
import { createRefreshTokenProvider } from "./gmail-auth.js";
import { mapGmailMessage, type GmailMessage } from "./gmail-mime.js";

const DEFAULT_BASE_URL = "https://gmail.googleapis.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 100;

/** Options shared by all Gmail reader configurations. */
export interface GmailReaderOptions {
  /** Gmail API base URL. Defaults to `https://gmail.googleapis.com`. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Gmail reader configured with OAuth client credentials and a refresh token. */
export interface GmailOAuthReaderConfig extends GmailReaderOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Token endpoint override, primarily for tests. */
  tokenUrl?: string;
}

/** Gmail reader configured with an existing access-token provider. */
export interface GmailTokenReaderConfig extends GmailReaderOptions {
  accessTokenProvider: AccessTokenProvider;
}

/** Configuration accepted by {@link createGmailReader}. */
export type GmailReaderConfig = GmailOAuthReaderConfig | GmailTokenReaderConfig;

interface GmailListResponse {
  messages?: Array<{ id: string; threadId?: string }>;
}

/**
 * Gmail implementation of the {@link MailReader} port.
 */
export class GmailReader implements MailReader {
  readonly provider = "gmail";
  private readonly tokenProvider: AccessTokenProvider;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /**
   * Creates a Gmail reader.
   *
   * @param options - Token provider, base URL, and timeout.
   */
  constructor(options: {
    tokenProvider: AccessTokenProvider;
    baseUrl?: string;
    timeoutMs?: number;
  }) {
    this.tokenProvider = options.tokenProvider;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Reads recent Gmail messages with subject and body.
   *
   * @param options - Maximum results and optional Gmail search query.
   * @returns Normalized messages.
   * @throws {MailError} When Gmail or OAuth fails.
   */
  async readMessages(options: ReadMessagesOptions = {}): Promise<EmailMessage[]> {
    const maxResults = Math.min(
      Math.max(options.maxResults ?? DEFAULT_MAX_RESULTS, 1),
      MAX_RESULTS_LIMIT,
    );

    const list = await this.request<GmailListResponse>("/gmail/v1/users/me/messages", {
      maxResults,
      q: options.query,
    });

    if (list.messages === undefined || list.messages.length === 0) {
      return [];
    }

    return Promise.all(
      list.messages.map(async (entry) => {
        const message = await this.request<GmailMessage>(
          `/gmail/v1/users/me/messages/${encodeURIComponent(entry.id)}`,
          { format: "full" },
        );
        return mapGmailMessage(message);
      }),
    );
  }

  /**
   * Sends an authenticated request to the Gmail API.
   *
   * @typeParam T - Expected response payload.
   * @param path - API path.
   * @param query - Query parameters; empty values are omitted.
   * @returns The parsed response payload.
   * @throws {MailError} On transport or API failures.
   */
  private async request<T>(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const token = await this.tokenProvider.getAccessToken();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new MailError(`Could not reach Gmail: ${(error as Error).message}`, "TRANSPORT_ERROR");
    }

    const payload = parseJson(await response.text());

    if (response.ok === false) {
      const data = (payload ?? {}) as { error?: { message?: string; status?: string } };
      throw new MailError(
        data.error?.message ?? `Gmail responded with HTTP ${response.status}`,
        "API_ERROR",
        response.status,
        payload,
      );
    }

    return payload as T;
  }
}

/**
 * Creates a Gmail reader from OAuth credentials or an access-token provider.
 *
 * @param config - Gmail reader configuration.
 * @returns A Gmail reader.
 */
export function createGmailReader(config: GmailReaderConfig): GmailReader {
  if ("accessTokenProvider" in config) {
    return new GmailReader({
      tokenProvider: config.accessTokenProvider,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
  }

  return new GmailReader({
    tokenProvider: createRefreshTokenProvider({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
      tokenUrl: config.tokenUrl,
      timeoutMs: config.timeoutMs,
    }),
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
  });
}
