import type { AccessTokenProvider } from "../../core/access-token.js";
import { MailError } from "../../core/errors.js";
import { parseJson } from "../../lib/parse-json.js";

const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_TIMEOUT_MS = 30_000;
const REFRESH_MARGIN_MS = 60_000;

/** Options for {@link createRefreshTokenProvider}. */
export interface RefreshTokenProviderOptions {
  /** Google OAuth client id. */
  clientId: string;
  /** Google OAuth client secret. */
  clientSecret: string;
  /** Refresh token obtained from the authorization flow. */
  refreshToken: string;
  /** Token endpoint override, primarily for tests. */
  tokenUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Raw token endpoint response. */
export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * Sends a token request to Google's OAuth token endpoint.
 *
 * @param params - Form parameters for the token request.
 * @param options - Endpoint and timeout overrides.
 * @returns The parsed token response.
 * @throws {MailError} On transport or OAuth failures.
 */
export async function requestGoogleToken(
  params: Record<string, string>,
  options: { tokenUrl?: string; timeoutMs?: number } = {},
): Promise<GoogleTokenResponse> {
  const tokenUrl = options.tokenUrl ?? DEFAULT_TOKEN_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new MailError(
      `Could not reach Google OAuth: ${(error as Error).message}`,
      "TRANSPORT_ERROR",
    );
  }

  const payload = parseJson(await response.text());

  if (response.ok === false) {
    const data = (payload ?? {}) as GoogleTokenResponse;
    throw new MailError(
      data.error_description ?? data.error ?? `Google OAuth responded with HTTP ${response.status}`,
      "AUTH_FAILED",
      response.status,
      payload,
    );
  }

  return (payload ?? {}) as GoogleTokenResponse;
}

/**
 * Creates an access token provider backed by a Google refresh token.
 * The access token is cached until shortly before it expires.
 *
 * @param options - OAuth client credentials and refresh token.
 * @returns An access token provider.
 */
export function createRefreshTokenProvider(
  options: RefreshTokenProviderOptions,
): AccessTokenProvider {
  let cached: { token: string; expiresAt: number } | null = null;

  return {
    async getAccessToken(): Promise<string> {
      const now = Date.now();
      if (cached !== null && cached.expiresAt - REFRESH_MARGIN_MS > now) {
        return cached.token;
      }

      //else

      const payload = await requestGoogleToken(
        {
          grant_type: "refresh_token",
          client_id: options.clientId,
          client_secret: options.clientSecret,
          refresh_token: options.refreshToken,
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

      const expiresIn = payload.expires_in ?? 3600;
      cached = { token: payload.access_token, expiresAt: now + expiresIn * 1000 };
      return cached.token;
    },
  };
}
