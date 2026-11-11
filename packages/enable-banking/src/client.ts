import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";
import type {
  AuthorizeSessionResponse,
  GetAspspsQuery,
  GetAspspsResponse,
  GetSessionResponse,
  StartAuthorizationRequest,
  StartAuthorizationResponse,
  TransactionsPage,
  TransactionsQuery,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.enablebanking.com";
const DEFAULT_AUDIENCE = "api.enablebanking.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const JWT_TTL_SECONDS = 3600;
const JWT_REFRESH_MARGIN_SECONDS = 60;
const ENABLE_BANKING_ISSUER = "enablebanking.com";

/** Options for {@link createEnableBankingClient}. */
export interface EnableBankingClientOptions {
  /** Application id from the Enable Banking control panel. */
  appId: string;
  /** PEM-encoded RSA private key matching the registered certificate. */
  privateKeyPem: string;
  /** API base URL. Defaults to `https://api.enablebanking.com`. */
  baseUrl?: string;
  /** JWT audience. Defaults to `api.enablebanking.com`. */
  audience?: string;
  /** Fetch timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
}

/** Typed Enable Banking account information client. */
export interface EnableBankingClient {
  /** Lists the banks available to the application. */
  listAspsps(query: GetAspspsQuery): Promise<GetAspspsResponse>;
  /** Starts bank authorization. */
  startAuthorization(input: StartAuthorizationRequest): Promise<StartAuthorizationResponse>;
  /** Exchanges an authorization code for a session. */
  authorizeSession(code: string): Promise<AuthorizeSessionResponse>;
  /** Fetches upstream session metadata. */
  getSession(sessionId: string): Promise<GetSessionResponse>;
  /** Revokes an upstream session. */
  deleteSession(sessionId: string): Promise<{ message: string }>;
  /** Fetches one page of transactions. */
  getTransactions(accountId: string, query: TransactionsQuery): Promise<TransactionsPage>;
}

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

/**
 * Error thrown when the SDK is misconfigured.
 */
export class EnableBankingConfigurationError extends Error {
  /**
   * Creates a configuration error.
   *
   * @param message - Human-readable description.
   */
  constructor(message: string) {
    super(message);
    this.name = "EnableBankingConfigurationError";
  }
}

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
}

/**
 * Creates a standalone Enable Banking client. Each client owns its private key
 * cache and JWT cache, so independent instances can use different credentials.
 *
 * @param options - Credentials, base URL, audience, and timeout.
 * @returns A typed Enable Banking client.
 * @throws {EnableBankingConfigurationError} When required options are missing or invalid.
 */
export function createEnableBankingClient(
  options: EnableBankingClientOptions,
): EnableBankingClient {
  // Validate required options
  if (options.appId.trim() === "") {
    throw new EnableBankingConfigurationError("appId is required.");
  }
  if (options.privateKeyPem.trim() === "") {
    throw new EnableBankingConfigurationError("privateKeyPem is required.");
  }

  // Resolve defaults
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const audience = options.audience ?? DEFAULT_AUDIENCE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    new URL(baseUrl);
  } catch {
    throw new EnableBankingConfigurationError("baseUrl must be a valid URL.");
  }

  // Per-client state
  let privateKey: KeyObject | null = null;
  let cachedJwt: { token: string; expiresAt: number } | null = null;

  /**
   * Loads the configured PEM private key once.
   *
   * @returns The parsed private key.
   * @throws {EnableBankingConfigurationError} When the PEM cannot be parsed.
   */
  function getPrivateKey(): KeyObject {
    if (privateKey !== null) return privateKey;

    //else

    try {
      privateKey = createPrivateKey(options.privateKeyPem);
      return privateKey;
    } catch {
      throw new EnableBankingConfigurationError(
        "The configured Enable Banking private key is not a valid PEM private key.",
      );
    }
  }

  /**
   * Creates (and briefly caches) the RS256 JWT expected by Enable Banking.
   *
   * @returns A signed JWT.
   * @throws {EnableBankingConfigurationError} When the private key is invalid.
   */
  async function createJwt(): Promise<string> {
    // Reuse a cached token until it is close to expiry
    const now = Math.floor(Date.now() / 1000);
    if (cachedJwt !== null && cachedJwt.expiresAt - JWT_REFRESH_MARGIN_SECONDS > now) {
      return cachedJwt.token;
    }

    //else

    // Sign a fresh token
    const expiresAt = now + JWT_TTL_SECONDS;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: options.appId })
      .setIssuer(ENABLE_BANKING_ISSUER)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(getPrivateKey());

    cachedJwt = { token, expiresAt };
    return token;
  }

  /**
   * Sends an authenticated request to the Enable Banking API.
   *
   * @typeParam T - Expected response payload type.
   * @param method - HTTP method to use.
   * @param path - API path, resolved against the configured base URL.
   * @param requestOptions - Optional query parameters and JSON body.
   * @returns The parsed response payload.
   * @throws {EnableBankingError} When the upstream request fails or returns a non-2xx status.
   * @throws {EnableBankingConfigurationError} When the private key is invalid.
   */
  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    // Build the request URL
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    // Build the authenticated headers and optional body
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await createJwt()}`,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(requestOptions.body);
    }

    // Send the request
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
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

  return {
    listAspsps(query: GetAspspsQuery): Promise<GetAspspsResponse> {
      // Map the typed filters onto query-string parameters
      const params: Record<string, string | undefined> = {
        country: query.country,
        service: query.service,
      };

      return request<GetAspspsResponse>("GET", "/aspsps", { query: params });
    },

    startAuthorization(input: StartAuthorizationRequest): Promise<StartAuthorizationResponse> {
      return request<StartAuthorizationResponse>("POST", "/auth", { body: input });
    },

    authorizeSession(code: string): Promise<AuthorizeSessionResponse> {
      return request<AuthorizeSessionResponse>("POST", "/sessions", { body: { code } });
    },

    getSession(sessionId: string): Promise<GetSessionResponse> {
      return request<GetSessionResponse>("GET", `/sessions/${encodeURIComponent(sessionId)}`);
    },

    deleteSession(sessionId: string): Promise<{ message: string }> {
      return request<{ message: string }>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
    },

    getTransactions(accountId: string, query: TransactionsQuery): Promise<TransactionsPage> {
      // Map the typed filters onto query-string parameters
      const params: Record<string, string | undefined> = {
        date_from: query.date_from,
        date_to: query.date_to,
        continuation_key: query.continuation_key,
        transaction_status: query.transaction_status,
      };

      return request<TransactionsPage>(
        "GET",
        `/accounts/${encodeURIComponent(accountId)}/transactions`,
        { query: params },
      );
    },
  };
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
