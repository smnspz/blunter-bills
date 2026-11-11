import type { FastifyInstance } from "fastify";
import { HttpError } from "../lib/errors.js";
import type { SessionRepository } from "../repositories/index.js";

/** Dependencies required by the account routes. */
export interface AccountRoutesOptions {
  /** Bank session persistence. */
  sessions: SessionRepository;
}

/**
 * Registers the account listing route.
 *
 * @param app - Fastify instance to attach routes to.
 * @param options - Injected repository accessors.
 * @returns Nothing. Resolves once routes are registered.
 */
export async function accountRoutes(
  app: FastifyInstance,
  options: AccountRoutesOptions,
): Promise<void> {
  /** Lists the accounts exposed by the stored session. */
  app.get("/accounts", async () => {
    const session = await options.sessions.getSession();
    if (session === null) {
      throw new HttpError(404, "no_session", "No authorized session. Call POST /auth first.");
    }

    //else

    return {
      aspsp: { name: session.aspspName, country: session.aspspCountry },
      access_valid_until: session.accessValidUntil,
      accounts: session.accounts,
    };
  });
}
