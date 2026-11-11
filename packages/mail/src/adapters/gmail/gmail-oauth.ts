import { MailError } from "../../core/errors.js";
import { requestGoogleToken } from "./gmail-auth.js";

/** Read-only Gmail scope. */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** Options for {@link createGmailAuthorizationUrl}. */
export interface GmailAuthorizationUrlOptions {
  /** Google OAuth client id. */
  clientId: string;
  /** Redirect URI registered on the OAuth client. */
  redirectUri: string;
  /** Opaque CSRF state value. */
  state: string;
  /** Scopes to request. Defaults to read-only Gmail access. */
  scopes?: string[];
}

/**
 * Builds the Google consent URL for the Gmail read-only flow.
 *
 * @param options - Client id, redirect URI, state, and optional scopes.
 * @returns The consent URL.
 */
export function createGmailAuthorizationUrl(options: GmailAuthorizationUrlOptions): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (options.scopes ?? [GMAIL_READONLY_SCOPE]).join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", options.state);
  return url.toString();
}

/** Options for {@link exchangeGmailAuthorizationCode}. */
export interface ExchangeGmailAuthorizationCodeOptions {
  /** Google OAuth client id. */
  clientId: string;
  /** Google OAuth client secret. */
  clientSecret: string;
  /** Authorization code from the redirect callback. */
  code: string;
  /** Redirect URI registered on the OAuth client. */
  redirectUri: string;
  /** Token endpoint override, primarily for tests. */
  tokenUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Tokens returned by the authorization-code exchange. */
export interface GmailTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string | null;
}

/**
 * Exchanges a Gmail authorization code for access and refresh tokens.
 *
 * @param options - OAuth client credentials, code, and redirect URI.
 * @returns The exchanged tokens.
 * @throws {MailError} When Google rejects the exchange.
 */
export async function exchangeGmailAuthorizationCode(
  options: ExchangeGmailAuthorizationCodeOptions,
): Promise<GmailTokens> {
  const payload = await requestGoogleToken(
    {
      grant_type: "authorization_code",
      code: options.code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
    },
    { tokenUrl: options.tokenUrl, timeoutMs: options.timeoutMs },
  );

  if (payload.access_token === undefined || payload.access_token === "") {
    throw new MailError(
      "Google OAuth did not return an access token.",
      "AUTH_FAILED",
      undefined,
      payload,
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in ?? 3600,
    scope: payload.scope ?? null,
  };
}
