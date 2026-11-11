import { useState } from "react";
import { ApiError } from "@/lib/api";

/** Redirect status of an OAuth-like flow. */
export type RedirectFlowStatus = "idle" | "redirecting";

/** Result returned by {@link useRedirectFlow}. */
export interface RedirectFlowResult<TArgs extends unknown[]> {
  status: RedirectFlowStatus;
  error: string | null;
  start: (...args: TArgs) => Promise<void>;
}

/**
 * Runs a start-authorization call and redirects the browser to the returned URL.
 *
 * @typeParam TArgs - Arguments accepted by the start function.
 * @param startFlow - Starts the flow and returns a redirect URL.
 * @param fallbackMessage - Message used for non-API failures.
 * @returns Redirect status, error message, and the start callback.
 */
export function useRedirectFlow<TArgs extends unknown[]>(
  startFlow: (...args: TArgs) => Promise<{ url: string }>,
  fallbackMessage: string,
): RedirectFlowResult<TArgs> {
  const [status, setStatus] = useState<RedirectFlowStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * Starts the flow and navigates away on success.
   *
   * @param args - Arguments forwarded to the start function.
   * @returns Nothing. Navigates the browser away on success.
   */
  async function start(...args: TArgs): Promise<void> {
    setStatus("redirecting");
    setError(null);

    try {
      const result = await startFlow(...args);
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : fallbackMessage);
      setStatus("idle");
    }
  }

  return { status, error, start };
}
