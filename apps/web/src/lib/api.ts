/** Bank metadata returned by GET /aspsps. */
export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  beta?: boolean;
}

/** Account stored with the authorized session. */
export interface SessionAccount {
  uid: string;
  name: string | null;
  iban: string | null;
  currency: string | null;
}

/** Authorized session returned by GET /session. */
export interface Session {
  session_id: string;
  aspsp: { name: string; country: string };
  access_valid_until: string | null;
  psu_type: string | null;
  authorized_at: string;
  accounts: SessionAccount[];
}

/** Response from POST /auth. */
export interface StartAuthResponse {
  url: string;
  authorization_id: string;
  state: string;
}

/** Response from POST /mail/gmail/start. */
export interface StartMailAuthResponse {
  url: string;
  state: string;
}

/** Mail connection status returned by GET /mail/status. */
export interface MailStatus {
  configured: boolean;
  connected: boolean;
  provider: string | null;
  connected_at: string | null;
}

/** Error thrown when the API returns a non-2xx response. */
export class ApiError extends Error {
  /**
   * Creates an API error.
   *
   * @param message - Human-readable message from the API.
   * @param status - HTTP status, or 0 for a network failure.
   * @param code - Stable machine-readable error code.
   */
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

/**
 * Parses a response body, falling back to the raw text.
 *
 * @param text - Raw response body.
 * @returns The parsed JSON value, the raw text, or null when empty.
 */
function parsePayload(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Sends a JSON request to the API and unwraps the response.
 *
 * @typeParam T - Expected response payload type.
 * @param path - API path, relative to the configured base URL.
 * @param init - Optional fetch options.
 * @returns The parsed response payload.
 * @throws {ApiError} When the request fails or returns a non-2xx status.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new ApiError("Could not reach the API.", 0, "network_error");
  }

  const payload = parsePayload(await response.text());

  if (response.ok === false) {
    const data = payload as { error?: string; message?: string } | null;
    throw new ApiError(
      data?.message ?? `Request failed with HTTP ${response.status}.`,
      response.status,
      data?.error,
    );
  }

  return payload as T;
}

/** Typed client for the Blunter Bills API. */
export const api = {
  /**
   * Fetches the stored bank session.
   *
   * @param signal - Optional abort signal.
   * @returns The authorized session.
   */
  getSession(signal?: AbortSignal): Promise<Session> {
    return request<Session>("/session", { signal });
  },

  /**
   * Lists banks available for a country.
   *
   * @param country - ISO 3166-1 alpha-2 country code.
   * @param signal - Optional abort signal.
   * @returns The matching banks.
   */
  listAspsps(country: string, signal?: AbortSignal): Promise<{ aspsps: Aspsp[] }> {
    return request<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}`, {
      signal,
    });
  },

  /**
   * Starts bank authorization and returns the Enable Banking redirect URL.
   *
   * @param input - Bank, country, and frontend return URL.
   * @returns The authorization redirect details.
   */
  startAuth(input: {
    aspspName: string;
    aspspCountry: string;
    returnUrl: string;
  }): Promise<StartAuthResponse> {
    return request<StartAuthResponse>("/auth", {
      method: "POST",
      body: JSON.stringify({
        aspsp_name: input.aspspName,
        aspsp_country: input.aspspCountry,
        psu_type: "personal",
        return_url: input.returnUrl,
      }),
    });
  },

  /**
   * Fetches the mail connection status.
   *
   * @param signal - Optional abort signal.
   * @returns Configured/connected state and provider.
   */
  getMailStatus(signal?: AbortSignal): Promise<MailStatus> {
    return request<MailStatus>("/mail/status", { signal });
  },

  /**
   * Starts the Gmail consent flow.
   *
   * @returns The Google consent URL and OAuth state.
   */
  startGmailAuth(): Promise<StartMailAuthResponse> {
    return request<StartMailAuthResponse>("/mail/gmail/start", { method: "POST" });
  },
};
