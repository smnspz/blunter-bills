import { useRedirectFlow } from "@/features/redirect/useRedirectFlow";
import { api, type Aspsp } from "@/lib/api";

/** Redirect status of the bank connect action. */
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
  const { status, error, start } = useRedirectFlow((bank: Aspsp) => {
    const returnUrl = `${window.location.origin}/auth/callback`;
    return api.startAuth({
      aspspName: bank.name,
      aspspCountry: bank.country,
      returnUrl,
    });
  }, "Could not start the bank authorization.");

  return { status, error, connect: start };
}
