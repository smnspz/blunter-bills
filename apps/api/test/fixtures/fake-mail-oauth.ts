import { MailError } from "@blunter-bills/mail";
import type { MailOAuth } from "../../src/mail-oauth.js";

/** Fake Gmail OAuth service used by API tests. */
export class FakeMailOAuth implements MailOAuth {
  readonly calls: string[] = [];

  /**
   * Returns a deterministic consent URL.
   *
   * @param state - OAuth state.
   * @returns A fake Google consent URL.
   */
  createAuthorizationUrl(state: string): string {
    this.calls.push(`url:${state}`);
    return `https://mock-google.example/auth?state=${state}`;
  }

  /**
   * Exchanges a fake code.
   *
   * @param code - Authorization code.
   * @returns A fake refresh token.
   * @throws {MailError} When the code is `bad-code`.
   */
  async exchangeCode(code: string): Promise<{ refreshToken: string | null }> {
    this.calls.push(`code:${code}`);
    if (code === "bad-code") {
      throw new MailError("Bad code", "AUTH_FAILED");
    }
    return { refreshToken: "refresh-token" };
  }
}
