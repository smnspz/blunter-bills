import { createGmailAuthorizationUrl, exchangeGmailAuthorizationCode } from "@blunter-bills/mail";
import { assertMailConfigured, config } from "./config.js";

/** API-level port for Gmail OAuth operations. */
export interface MailOAuth {
  /**
   * Builds the Google consent URL.
   *
   * @param state - Opaque CSRF state value.
   * @returns The consent URL.
   */
  createAuthorizationUrl(state: string): string;

  /**
   * Exchanges a Google authorization code.
   *
   * @param code - Authorization code from the callback.
   * @returns The refresh token, or null when Google did not issue one.
   */
  exchangeCode(code: string): Promise<{ refreshToken: string | null }>;
}

let service: MailOAuth | null = null;

/**
 * Returns the configured Gmail OAuth service, creating it on first use.
 *
 * @returns The shared Gmail OAuth service.
 * @throws {HttpError} When the Google credentials are missing.
 */
export function getConfiguredMailOAuth(): MailOAuth {
  assertMailConfigured();

  //else

  if (service === null) {
    service = {
      createAuthorizationUrl(state: string): string {
        return createGmailAuthorizationUrl({
          clientId: config.mail.googleClientId,
          redirectUri: config.mail.gmailRedirectUrl,
          state,
        });
      },
      async exchangeCode(code: string): Promise<{ refreshToken: string | null }> {
        const tokens = await exchangeGmailAuthorizationCode({
          clientId: config.mail.googleClientId,
          clientSecret: config.mail.googleClientSecret,
          code,
          redirectUri: config.mail.gmailRedirectUrl,
        });
        return { refreshToken: tokens.refreshToken };
      },
    };
  }

  return service;
}
