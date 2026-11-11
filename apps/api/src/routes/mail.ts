import { randomUUID } from "node:crypto";
import { MailError } from "@blunter-bills/mail";
import type { FastifyInstance } from "fastify";
import { config, missingMailConfig } from "../config.js";
import { oauthCallbackQuerySchema } from "../lib/oauth.js";
import { MAIL_CALLBACK_PATH } from "../lib/paths.js";
import { withQueryParams } from "../lib/url.js";
import type { MailOAuth } from "../mail-oauth.js";
import type { MailRepository } from "../repositories/index.js";

interface MailCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/** Dependencies required by the mail routes. */
export interface MailRoutesOptions {
  /** Returns the Gmail OAuth service, or throws when it is not configured. */
  getMailOAuth: () => MailOAuth;
  /** Mail connection persistence. */
  mail: MailRepository;
}

/**
 * Builds the frontend mail setup URL for a callback result.
 *
 * @param status - Callback outcome.
 * @param message - Optional error message.
 * @returns The frontend setup URL.
 */
function mailSetupUrl(status: "success" | "error", message?: string): string {
  const setupUrl = new URL("/setup/mail", config.server.frontendUrl).toString();
  return withQueryParams(setupUrl, { mail: status, message });
}

/**
 * Registers the Gmail connection routes.
 *
 * @param app - Fastify instance to attach routes to.
 * @param options - Injected Gmail OAuth service and repository accessors.
 * @returns Nothing. Resolves once routes are registered.
 */
export async function mailRoutes(app: FastifyInstance, options: MailRoutesOptions): Promise<void> {
  /** Reports whether Gmail OAuth is configured and a mailbox is connected. */
  app.get("/mail/status", async () => {
    const connection = await options.mail.getConnection();
    return {
      configured: missingMailConfig().length === 0,
      connected: connection !== null,
      provider: connection?.provider ?? null,
      connected_at: connection?.connectedAt ?? null,
    };
  });

  /** Starts the Gmail consent flow and returns the Google URL. */
  app.post("/mail/gmail/start", async () => {
    const mailOAuth = options.getMailOAuth();
    const state = randomUUID();
    await options.mail.addPendingState(state);
    return { url: mailOAuth.createAuthorizationUrl(state), state };
  });

  /**
   * Gmail OAuth callback. Exchanges the code, stores the refresh token, and
   * redirects back to the frontend setup page.
   */
  app.get<{ Querystring: MailCallbackQuery }>(
    MAIL_CALLBACK_PATH,
    { schema: { querystring: oauthCallbackQuerySchema } },
    async (request, reply) => {
      const { code, state, error, error_description: errorDescription } = request.query;

      // Handle a denied or failed consent
      if (error !== undefined && error !== "") {
        return reply.redirect(mailSetupUrl("error", errorDescription ?? error));
      }

      // Validate the callback parameters
      if (code === undefined || code === "") {
        return reply.redirect(mailSetupUrl("error", "missing_code"));
      }
      if (state === undefined || state === "") {
        return reply.redirect(mailSetupUrl("error", "missing_state"));
      }

      // Check that this service issued the state
      const validState = await options.mail.consumePendingState(state);
      if (validState === false) {
        return reply.redirect(mailSetupUrl("error", "invalid_state"));
      }

      //else

      try {
        // Exchange the code and store the refresh token
        const mailOAuth = options.getMailOAuth();
        const tokens = await mailOAuth.exchangeCode(code);

        if (tokens.refreshToken === null) {
          return reply.redirect(mailSetupUrl("error", "no_refresh_token"));
        }

        await options.mail.saveConnection({
          provider: "gmail",
          refreshToken: tokens.refreshToken,
          connectedAt: new Date().toISOString(),
        });

        return reply.redirect(mailSetupUrl("success"));
      } catch (caught) {
        const message =
          caught instanceof MailError ? (caught.code ?? caught.message) : "mail_auth_failed";
        return reply.redirect(mailSetupUrl("error", message));
      }
    },
  );

  /** Disconnects the stored mailbox. */
  app.delete("/mail", async () => {
    await options.mail.clearConnection();
    return { ok: true };
  });
}
