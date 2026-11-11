import { randomUUID } from "node:crypto";
import {
  EnableBankingError,
  type Aspsp,
  type EnableBankingClient,
  type GetAspspsQuery,
  type PsuType,
  type SessionAccount,
} from "@blunter-bills/enable-banking";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { HttpError } from "../lib/errors.js";
import { AUTH_CALLBACK_PATH } from "../lib/paths.js";
import {
  addPendingState,
  clearSession,
  consumePendingState,
  getStoredSession,
  saveSession,
  type StoredAccount,
} from "../session-store.js";

const MS_PER_DAY = 86_400_000;

interface StartAuthBody {
  aspsp_name?: string;
  aspsp_country?: string;
  psu_type?: PsuType;
  language?: string;
  valid_until?: string;
  state?: string;
  return_url?: string;
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface AspspsQuery {
  country?: string;
  service?: string;
}

interface AuthorizationResult {
  sessionId: string;
  accounts: StoredAccount[];
  aspsp: Aspsp;
  accessValidUntil: string | null;
}

/** Dependencies required by the auth routes. */
export interface AuthRoutesOptions {
  /** Returns the Enable Banking client, or throws when it is not configured. */
  getEnableBanking: () => EnableBankingClient;
}

const startAuthBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    aspsp_name: { type: "string", minLength: 1 },
    aspsp_country: { type: "string", minLength: 2, maxLength: 2 },
    psu_type: { type: "string", enum: ["personal", "business"] },
    language: { type: "string", minLength: 2, maxLength: 5 },
    valid_until: { type: "string", minLength: 10 },
    state: { type: "string", minLength: 1 },
    return_url: { type: "string", minLength: 1 },
  },
} as const;

const callbackQuerySchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    code: { type: "string" },
    state: { type: "string" },
    error: { type: "string" },
    error_description: { type: "string" },
  },
} as const;

/**
 * Converts Enable Banking session accounts into the persisted shape.
 *
 * @param accounts - Accounts returned by POST /sessions.
 * @returns Accounts reduced to the fields this service stores.
 */
function toStoredAccounts(accounts: SessionAccount[]): StoredAccount[] {
  return accounts.map((account) => ({
    uid: account.uid,
    name: account.name ?? account.product ?? null,
    iban: account.account_id?.iban ?? account.account_id?.other?.identification ?? null,
    currency: account.currency ?? null,
  }));
}

/**
 * Resolves the bank from the request, falling back to configured defaults.
 *
 * @param body - Parsed request body.
 * @returns The ASPSP name and upper-cased country code.
 * @throws {HttpError} When no name or country can be resolved.
 */
function resolveAspsp(body: StartAuthBody): Aspsp {
  const name = body.aspsp_name ?? config.enableBanking.defaultAspspName;
  const country = body.aspsp_country ?? config.enableBanking.defaultAspspCountry;

  if (name === undefined || country === undefined) {
    throw new HttpError(
      400,
      "aspsp_required",
      "Provide aspsp_name and aspsp_country (or set ENABLE_BANKING_ASPSP_NAME / ENABLE_BANKING_ASPSP_COUNTRY).",
    );
  }

  //else

  return { name, country: country.toUpperCase() };
}

/**
 * Resolves the requested consent expiry.
 *
 * @param validUntil - Optional ISO date-time from the request.
 * @returns The expiry date.
 * @throws {HttpError} When validUntil is not a valid date-time.
 */
function resolveAccessValidUntil(validUntil: string | undefined): Date {
  const parsed =
    validUntil !== undefined
      ? new Date(validUntil)
      : new Date(Date.now() + config.enableBanking.accessValidDays * MS_PER_DAY);

  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "invalid_valid_until", "valid_until must be a valid ISO date-time.");
  }

  return parsed;
}

/**
 * Validates the post-authorization frontend redirect URL.
 *
 * @param requested - Optional absolute URL from the request.
 * @returns The validated URL, or null when none was requested.
 * @throws {HttpError} When the URL is invalid or uses another origin.
 */
function resolveReturnUrl(requested: string | undefined): string | null {
  if (requested === undefined) return null;

  //else

  let parsed: URL;
  try {
    parsed = new URL(requested);
  } catch {
    throw new HttpError(400, "invalid_return_url", "return_url must be an absolute URL.");
  }

  const allowed = new URL(config.server.frontendUrl);
  if (parsed.origin !== allowed.origin) {
    throw new HttpError(
      400,
      "invalid_return_url",
      `return_url must use the configured frontend origin (${allowed.origin}).`,
    );
  }

  return parsed.toString();
}

/**
 * Appends the authorization result to a frontend redirect URL.
 *
 * @param returnUrl - Validated frontend URL.
 * @param status - Authorization outcome.
 * @param message - Optional error message.
 * @returns The frontend URL with result query parameters.
 */
function withAuthResult(returnUrl: string, status: "success" | "error", message?: string): string {
  const url = new URL(returnUrl);
  url.searchParams.set("auth", status);
  if (message !== undefined) url.searchParams.set("message", message);
  return url.toString();
}

/**
 * Exchanges an authorization code for a session and persists it locally.
 *
 * @param enableBanking - Enable Banking client to use.
 * @param code - Authorization code returned by Enable Banking.
 * @returns The persisted session data plus the account list.
 * @throws {EnableBankingError} When Enable Banking rejects the code.
 */
async function completeAuthorization(
  enableBanking: EnableBankingClient,
  code: string,
): Promise<AuthorizationResult> {
  // Exchange the code for a session
  const session = await enableBanking.authorizeSession(code);
  const accounts = toStoredAccounts(session.accounts);
  const accessValidUntil = session.access?.valid_until ?? null;

  // Persist the session for later requests
  await saveSession({
    sessionId: session.session_id,
    accounts,
    aspspName: session.aspsp.name,
    aspspCountry: session.aspsp.country,
    accessValidUntil,
    psuType: session.psu_type ?? null,
    authorizedAt: new Date().toISOString(),
  });

  // Return the stored session data
  return {
    sessionId: session.session_id,
    accounts,
    aspsp: session.aspsp,
    accessValidUntil,
  };
}

/**
 * Registers bank authorization and session routes.
 *
 * @param app - Fastify instance to attach routes to.
 * @param options - Injected Enable Banking client accessor.
 * @returns Nothing. Resolves once routes are registered.
 */
export async function authRoutes(app: FastifyInstance, options: AuthRoutesOptions): Promise<void> {
  /** Lists the banks (ASPSPs) available to this application. */
  app.get<{ Querystring: AspspsQuery }>(
    "/aspsps",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            country: { type: "string", minLength: 2, maxLength: 2 },
            service: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      // Map the request filters
      const query: GetAspspsQuery = {};
      if (request.query.country !== undefined) {
        query.country = request.query.country.toUpperCase();
      }
      if (request.query.service !== undefined) {
        query.service = request.query.service;
      }

      return options.getEnableBanking().listAspsps(query);
    },
  );

  /**
   * Step 1 of the bank authorization flow: ask Enable Banking for a URL the
   * user must open to authenticate with their bank.
   */
  app.post<{ Body: StartAuthBody }>(
    "/auth",
    { schema: { body: startAuthBodySchema } },
    async (request) => {
      const body = request.body ?? {};

      // Resolve bank, consent, and return URL
      const aspsp = resolveAspsp(body);
      const validUntil = resolveAccessValidUntil(body.valid_until);
      const returnUrl = resolveReturnUrl(body.return_url);
      const state = body.state ?? randomUUID();

      // Start the upstream authorization
      const enableBanking = options.getEnableBanking();
      const response = await enableBanking.startAuthorization({
        access: { valid_until: validUntil.toISOString() },
        aspsp,
        redirect_url: config.enableBanking.redirectUrl,
        state,
        ...(body.psu_type !== undefined ? { psu_type: body.psu_type } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
      });

      // Remember the state until the redirect returns
      await addPendingState(state, returnUrl);

      return {
        url: response.url,
        authorization_id: response.authorization_id,
        state,
      };
    },
  );

  /**
   * Step 2: Enable Banking redirects the user here with ?code=&state=.
   * Exchange the code for a session and persist it for later API calls.
   */
  app.get<{ Querystring: CallbackQuery }>(
    AUTH_CALLBACK_PATH,
    { schema: { querystring: callbackQuerySchema } },
    async (request, reply) => {
      const { code, state, error, error_description: errorDescription } = request.query;

      // Handle a denied or failed authorization
      if (error !== undefined && error !== "") {
        const pending =
          state !== undefined && state !== "" ? await consumePendingState(state) : null;
        if (pending !== null && pending.returnUrl !== null) {
          return reply.redirect(
            withAuthResult(pending.returnUrl, "error", errorDescription ?? error),
          );
        }
        throw new HttpError(400, "authorization_failed", errorDescription ?? error);
      }

      // Validate the redirect parameters
      if (code === undefined || code === "") {
        throw new HttpError(400, "missing_code", "Missing authorization code.");
      }
      if (state === undefined || state === "") {
        throw new HttpError(400, "missing_state", "Missing state parameter.");
      }

      // Check that this service issued the state
      const pending = await consumePendingState(state);
      if (pending === null) {
        throw new HttpError(400, "invalid_state", "Unknown or expired state parameter.");
      }

      //else

      try {
        // Exchange the code and persist the session
        const enableBanking = options.getEnableBanking();
        const result = await completeAuthorization(enableBanking, code);

        if (pending.returnUrl !== null) {
          return reply.redirect(withAuthResult(pending.returnUrl, "success"));
        }

        return {
          ok: true,
          session_id: result.sessionId,
          aspsp: result.aspsp,
          access_valid_until: result.accessValidUntil,
          accounts: result.accounts,
        };
      } catch (caught) {
        if (pending.returnUrl !== null) {
          const message =
            caught instanceof EnableBankingError
              ? (caught.code ?? caught.message)
              : "Authorization failed";
          return reply.redirect(withAuthResult(pending.returnUrl, "error", message));
        }
        throw caught;
      }
    },
  );

  /** Returns the locally stored session (no upstream call). */
  app.get("/session", async () => {
    const session = await getStoredSession();
    if (session === null) {
      throw new HttpError(404, "no_session", "No authorized session. Call POST /auth first.");
    }

    //else

    return {
      session_id: session.sessionId,
      aspsp: { name: session.aspspName, country: session.aspspCountry },
      access_valid_until: session.accessValidUntil,
      psu_type: session.psuType,
      authorized_at: session.authorizedAt,
      accounts: session.accounts,
    };
  });

  /** Verifies the session with Enable Banking, then deletes it and clears local state. */
  app.delete("/session", async () => {
    const session = await getStoredSession();
    if (session === null) {
      throw new HttpError(404, "no_session", "No authorized session to delete.");
    }

    //else

    const enableBanking = options.getEnableBanking();

    // Verify upstream, tolerating an already-forgotten session
    const upstream = await enableBanking.getSession(session.sessionId).catch((caught: unknown) => {
      if (caught instanceof EnableBankingError && caught.status === 404) return null;
      throw caught;
    });

    if (upstream !== null) {
      await enableBanking.deleteSession(session.sessionId);
    }

    // Clear local state
    await clearSession();
    return { ok: true, message: "Session deleted." };
  });
}
