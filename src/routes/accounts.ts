import type { FastifyInstance } from "fastify";
import { HttpError } from "../lib/errors.js";
import { getStoredSession } from "../session-store.js";

/**
 * Registers the account listing route.
 *
 * @param app - Fastify instance to attach routes to.
 * @returns Nothing. Resolves once routes are registered.
 */
export async function accountRoutes(app: FastifyInstance): Promise<void> {
  /** Lists the accounts exposed by the stored session. */
  app.get("/accounts", async () => {
    const session = await getStoredSession();
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
