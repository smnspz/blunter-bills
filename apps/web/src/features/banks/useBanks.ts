import { useEffect, useState } from "react";
import { ApiError, api, type Aspsp } from "@/lib/api";

/** Bank list state for a country. */
export type BanksState =
  | { status: "loading" }
  | { status: "ready"; banks: Aspsp[] }
  | { status: "error"; message: string };

/** Result returned by {@link useBanks}. */
export interface UseBanksResult {
  state: BanksState;
  refresh: () => void;
}

/**
 * Loads the banks available for a country.
 *
 * @param country - ISO 3166-1 alpha-2 country code.
 * @returns The bank list state and a refresh callback.
 */
export function useBanks(country: string): UseBanksResult {
  const [state, setState] = useState<BanksState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    api
      .listAspsps(country, controller.signal)
      .then(({ aspsps }) =>
        setState({
          status: "ready",
          banks: [...aspsps].sort((a, b) => a.name.localeCompare(b.name)),
        }),
      )
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: caught instanceof ApiError ? caught.message : "Could not load the bank list.",
        });
      });

    return () => controller.abort();
  }, [country, reloadKey]);

  return { state, refresh: () => setReloadKey((key) => key + 1) };
}
