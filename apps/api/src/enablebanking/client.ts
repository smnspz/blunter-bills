import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";
import { assertEnableBankingConfigured, config } from "../config.js";
import { HttpError } from "../lib/errors.js";

const JWT_TTL_SECONDS = 3600;
const JWT_REFRESH_MARGIN_SECONDS = 60;
const ENABLE_BANKING_ISSUER = "enablebanking.com";

/**
 * Error returned by (or while calling) the Enable Banking API.
 */
export class EnableBankingError extends Error {
  /**
   * Creates an upstream error.
   *
   * @param message - Human-readable description.
   * @param status - HTTP status returned by Enable Banking, or 502 for transport failures.
   * @param code - Enable Banking error code, when available.
   * @param details - Raw upstream error payload, when available.
   */
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "EnableBankingError";
  }
}

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

let privateKey: KeyObject | null = null;
let cachedJwt: { token: string; expiresAt: number } | null = null;

/**
 * Loads the configured PEM private key once.
 *
 * @returns The parsed private key.
 * @throws {HttpError} When the configured PEM cannot be parsed.
 */
function getPrivateKey(): KeyObject {
  if (privateKey !== null) return privateKey;

  //else

  try {
    // Accepts PKCS#8 and PKCS#1 PEM private keys.
    privateKey = createPrivateKey(config.enableBanking.privateKeyPem);
    return privateKey;
  } catch {
    throw new HttpError(
      500,
      "invalid_private_key",
      "The configured Enable Banking private key is not a valid PEM private key.",
    );
  }
}

/**
 * Creates (and briefly caches) the RS256 JWT expected by Enable Banking.
 * The header kid is the application id and the issuer is enablebanking.com.
 *
 * @returns A signed JWT.
 * @throws {HttpError} When Enable Banking credentials are missing or invalid.
 */
export async function createJwt(): Promise<string> {
  assertEnableBankingConfigured();

  // Reuse a cached token until it is close to expiry
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt !== null && cachedJwt.expiresAt - JWT_REFRESH_MARGIN_SECONDS > now) {
    return cachedJwt.token;
  }

  //else

  // Sign a fresh token
  const expiresAt = now + JWT_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: config.enableBanking.appId })
    .setIssuer(ENABLE_BANKING_ISSUER)
    .setAudience(config.enableBanking.jwtAudience)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(getPrivateKey());

  cachedJwt = { token, expiresAt };
  return token;
}

/**
 * Parses a response body, falling back to the raw text for non-JSON payloads.
 *
 * @param text - Raw response body.
 * @returns The parsed JSON value, or the original text when parsing fails.
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Sends an authenticated request to the Enable Banking API.
 *
 * @typeParam T - Expected response payload type.
 * @param method - HTTP method to use.
 * @param path - API path, resolved against the configured base URL.
 * @param options - Optional query parameters and JSON body.
 * @returns The parsed response payload.
 * @throws {EnableBankingError} When the upstream request fails or returns a non-2xx status.
 * @throws {HttpError} When Enable Banking credentials are missing or invalid.
 */
export async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  assertEnableBankingConfigured();

  // Build the request URL
  const url = new URL(path, config.enableBanking.baseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  // Build the authenticated headers and optional body
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await createJwt()}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  // Send the request
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(config.enableBanking.timeoutMs),
    });
  } catch (error) {
    throw new EnableBankingError(
      `Could not reach Enable Banking: ${(error as Error).message}`,
      502,
      "UPSTREAM_UNREACHABLE",
    );
  }

  // Parse and validate the response
  const text = await response.text();
  const payload = text === "" ? undefined : parseJson(text);

  if (response.ok === false) {
    const data = (payload ?? {}) as {
      code?: string;
      message?: string;
      error?: string;
      error_description?: string;
    };
    throw new EnableBankingError(
      data.message ??
        data.error_description ??
        `Enable Banking responded with HTTP ${response.status}`,
      response.status,
      data.code ?? data.error,
      payload,
    );
  }

  return payload as T;
}
