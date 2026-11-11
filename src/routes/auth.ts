import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  authorizeSession,
  deleteSession,
  getAspsps,
  getSession,
  startAuthorization,
  type GetAspspsQuery,
} from "../enablebanking/api.js";
import { EnableBankingError } from "../enablebanking/client.js";
import type { Aspsp, PsuType, SessionAccount } from "../enablebanking/types.js";
import { HttpError } from "../lib/errors.js";
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
 * Exchanges an authorization code for a session and persists it locally.
 *
 * @param code - Authorization code returned by Enable Banking.
 * @returns The persisted session data plus the account list.
 * @throws {EnableBankingError} When Enable Banking rejects the code.
 */
async function completeAuthorization(code: string): Promise<AuthorizationResult> {
  // Exchange the code for a session
  const session = await authorizeSession(code);
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
 * @returns Nothing. Resolves once routes are registered.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
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

      return getAspsps(query);
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

      // Resolve bank and consent details
      const aspsp = resolveAspsp(body);
      const validUntil = resolveAccessValidUntil(body.valid_until);
      const state = body.state ?? randomUUID();

      // Start the upstream authorization
      const response = await startAuthorization({
        access: { valid_until: validUntil.toISOString() },
        aspsp,
        redirect_url: config.enableBanking.redirectUrl,
        state,
        ...(body.psu_type !== undefined ? { psu_type: body.psu_type } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
      });

      // Remember the state until the redirect returns
      await addPendingState(state);

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
    "/auth/callback",
    { schema: { querystring: callbackQuerySchema } },
    async (request) => {
      const { code, state, error, error_description: errorDescription } = request.query;

      // Handle a denied or failed authorization
      if (error !== undefined && error !== "") {
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
      const validState = await consumePendingState(state);
      if (validState === false) {
        throw new HttpError(400, "invalid_state", "Unknown or expired state parameter.");
      }

      //else

      // Exchange the code and persist the session
      const result = await completeAuthorization(code);

      return {
        ok: true,
        session_id: result.sessionId,
        aspsp: result.aspsp,
        access_valid_until: result.accessValidUntil,
        accounts: result.accounts,
      };
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

    // Verify upstream, tolerating an already-forgotten session
    const upstream = await getSession(session.sessionId).catch((caught: unknown) => {
      if (caught instanceof EnableBankingError && caught.status === 404) return null;
      throw caught;
    });

    if (upstream !== null) {
      await deleteSession(session.sessionId);
    }

    // Clear local state
    await clearSession();
    return { ok: true, message: "Session deleted." };
  });
}
