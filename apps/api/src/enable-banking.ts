import { createEnableBankingClient, type EnableBankingClient } from "@blunter-bills/enable-banking";
import { assertEnableBankingConfigured, config } from "./config.js";

let client: EnableBankingClient | null = null;

/**
 * Returns the configured Enable Banking client, creating it on first use.
 *
 * @returns The shared Enable Banking client.
 * @throws {HttpError} When Enable Banking credentials are missing.
 */
export function getConfiguredEnableBanking(): EnableBankingClient {
  assertEnableBankingConfigured();

  //else

  if (client === null) {
    client = createEnableBankingClient({
      appId: config.enableBanking.appId,
      privateKeyPem: config.enableBanking.privateKeyPem,
      baseUrl: config.enableBanking.baseUrl,
      audience: config.enableBanking.jwtAudience,
      timeoutMs: config.enableBanking.timeoutMs,
    });
  }

  return client;
}
