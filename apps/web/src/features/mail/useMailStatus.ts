import { useEffect, useState } from "react";
import { ApiError, api, type MailStatus } from "@/lib/api";

/** Mail status lookup state. */
export type MailStatusState =
  | { status: "loading" }
  | { status: "ready"; mail: MailStatus }
  | { status: "error"; message: string };

/** Result returned by {@link useMailStatus}. */
export interface UseMailStatusResult {
  state: MailStatusState;
  refresh: () => void;
}

/**
 * Loads the mail connection status and exposes a manual refresh.
 *
 * @returns The current mail status and a refresh callback.
 */
export function useMailStatus(): UseMailStatusResult {
  const [state, setState] = useState<MailStatusState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    api
      .getMailStatus(controller.signal)
      .then((mail) => setState({ status: "ready", mail }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            caught instanceof ApiError ? caught.message : "Could not load the mail connection.",
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  return { state, refresh: () => setReloadKey((key) => key + 1) };
}
