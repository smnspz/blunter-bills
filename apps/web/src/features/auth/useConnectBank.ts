import { useState } from "react";
import { ApiError, api, type Aspsp } from "@/lib/api";

/** Redirect status of the connect action. */
export type ConnectStatus = "idle" | "redirecting";

/** Result returned by {@link useConnectBank}. */
export interface UseConnectBankResult {
  status: ConnectStatus;
  error: string | null;
  connect: (bank: Aspsp) => Promise<void>;
}

/**
 * Starts bank authorization and redirects the browser to Enable Banking.
 *
 * @returns The redirect status, any error message, and the connect callback.
 */
export function useConnectBank(): UseConnectBankResult {
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * Starts authorization for the selected bank.
   *
   * @param bank - Bank chosen in the picker.
   * @returns Nothing. Navigates the browser away on success.
   */
  async function connect(bank: Aspsp): Promise<void> {
    setStatus("redirecting");
    setError(null);

    try {
      const returnUrl = `${window.location.origin}/auth/callback`;
      const result = await api.startAuth({
        aspspName: bank.name,
        aspspCountry: bank.country,
        returnUrl,
      });
      window.location.assign(result.url);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not start the bank authorization.",
      );
      setStatus("idle");
    }
  }

  return { status, error, connect };
}
