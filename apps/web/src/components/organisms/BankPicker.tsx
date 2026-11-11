import { useState, type FormEvent } from "react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { Spinner } from "@/components/atoms/Spinner";
import { BankOption } from "@/components/molecules/BankOption";
import { Field } from "@/components/molecules/Field";
import { Notice } from "@/components/molecules/Notice";
import { useBanks } from "@/features/banks/useBanks";
import type { Aspsp } from "@/lib/api";
import { COUNTRIES, defaultCountry } from "@/lib/countries";

interface BankPickerProps {
  onConnect: (bank: Aspsp) => void;
  redirecting: boolean;
  error: string | null;
}

/**
 * Country, search, and bank selection form.
 *
 * @param props - Connect handler, redirect state, and any connect error.
 * @returns The bank picker form.
 */
export function BankPicker({ onConnect, redirecting, error }: BankPickerProps) {
  const [country, setCountry] = useState(defaultCountry);
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { state, refresh } = useBanks(country);

  const selected =
    state.status === "ready"
      ? (state.banks.find((bank) => bank.name === selectedName) ?? null)
      : null;

  const visible =
    state.status === "ready"
      ? state.banks.filter((bank) => bank.name.toLowerCase().includes(query.trim().toLowerCase()))
      : [];

  /**
   * Submits the selected bank.
   *
   * @param event - Form submit event.
   * @returns Nothing.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (selected !== null) onConnect(selected);
  }

  /**
   * Changes country and clears the current selection.
   *
   * @param nextCountry - Next ISO country code.
   * @returns Nothing.
   */
  function handleCountryChange(nextCountry: string): void {
    setCountry(nextCountry);
    setSelectedName(null);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="country" label="Country">
          <Select
            id="country"
            value={country}
            onChange={(event) => handleCountryChange(event.target.value)}
          >
            {COUNTRIES.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="search" label="Search">
          <Input
            id="search"
            type="search"
            value={query}
            placeholder="Fineco, MPS, ..."
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Available banks</span>
          <span className="text-[11px] text-ink/60">
            {state.status === "ready" ? `${visible.length} shown` : ""}
          </span>
        </div>

        <div
          className="max-h-80 overflow-y-auto border-2 border-ink"
          aria-busy={state.status === "loading"}
        >
          {state.status === "loading" ? (
            <div className="divide-y-2 divide-ink/20" role="status" aria-label="Loading banks">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-3 py-4">
                  <span className="size-8 border-2 border-ink/30" />
                  <span className="h-3 w-40 animate-pulse bg-ink/20" />
                </div>
              ))}
            </div>
          ) : state.status === "error" ? (
            <div className="space-y-3 p-4">
              <Notice tone="error">{state.message}</Notice>
              <Button variant="secondary" onClick={refresh}>
                Retry
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-4 text-sm text-ink/70">
              No banks found. Try another country or clear the search.
            </div>
          ) : (
            <div role="radiogroup" aria-label="Select a bank" className="divide-y-2 divide-ink">
              {visible.map((bank) => (
                <BankOption
                  key={`${bank.country}:${bank.name}`}
                  bank={bank}
                  checked={selectedName === bank.name}
                  onSelect={() => setSelectedName(bank.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="min-h-5 text-[11px] uppercase tracking-[0.16em] text-ink/60">
        {selected !== null
          ? `Selected: ${selected.name} / ${selected.country}`
          : "No bank selected"}
      </p>

      {error !== null ? <Notice tone="error">{error}</Notice> : null}

      <Button type="submit" disabled={selected === null || redirecting} className="w-full">
        {redirecting ? (
          <>
            <Spinner />
            Redirecting
          </>
        ) : (
          "Continue to bank"
        )}
      </Button>

      <p className="text-[11px] leading-relaxed text-ink/60">
        You will be redirected to Enable Banking and your bank to approve read-only access. Blunter
        Bills never sees your bank credentials.
      </p>
    </form>
  );
}
