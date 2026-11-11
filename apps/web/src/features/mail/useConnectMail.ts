import { useRedirectFlow } from "@/features/redirect/useRedirectFlow";
import { api } from "@/lib/api";

/** Redirect status of the Gmail connect action. */
export type ConnectMailStatus = "idle" | "redirecting";

/** Result returned by {@link useConnectMail}. */
export interface UseConnectMailResult {
  status: ConnectMailStatus;
  error: string | null;
  connectGmail: () => Promise<void>;
}

/**
 * Starts the Gmail consent flow and redirects the browser to Google.
 *
 * @returns Redirect status, error message, and the connect callback.
 */
export function useConnectMail(): UseConnectMailResult {
  const { status, error, start } = useRedirectFlow(
    () => api.startGmailAuth(),
    "Could not start Gmail authorization.",
  );

  return { status, error, connectGmail: start };
}
