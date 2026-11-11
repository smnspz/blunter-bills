import { useEffect, useState } from "react";
import { ApiError, api, type Session } from "@/lib/api";

/** Session lookup state. */
export type SessionState =
  | { status: "loading" }
  | { status: "connected"; session: Session }
  | { status: "disconnected" }
  | { status: "error"; message: string };

/** Result returned by {@link useSession}. */
export interface UseSessionResult {
  state: SessionState;
  refresh: () => void;
}

/**
 * Loads the stored bank session and exposes a manual refresh.
 *
 * @returns The current session state and a refresh callback.
 */
export function useSession(): UseSessionResult {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    api
      .getSession(controller.signal)
      .then((session) => setState({ status: "connected", session }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;

        // Treat a missing session as "not connected yet"
        if (caught instanceof ApiError && caught.status === 404) {
          setState({ status: "disconnected" });
          return;
        }

        setState({
          status: "error",
          message: caught instanceof Error ? caught.message : "Could not load the session.",
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  return { state, refresh: () => setReloadKey((key) => key + 1) };
}
