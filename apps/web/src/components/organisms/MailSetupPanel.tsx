import { useState, type FormEvent } from "react";
import { Button } from "@/components/atoms/Button";
import { Spinner } from "@/components/atoms/Spinner";
import { MailProviderCard } from "@/components/molecules/MailProviderCard";
import { Notice } from "@/components/molecules/Notice";
import { MAIL_PROVIDERS, type MailProviderId } from "@/lib/mail-providers";

interface MailSetupPanelProps {
  configured: boolean;
  redirecting: boolean;
  error: string | null;
  onConnect: () => void;
}

/**
 * Explains why email access is needed and lets the user pick a provider.
 *
 * @param props - Configuration state, redirect state, error, and connect handler.
 * @returns The mail setup form.
 */
export function MailSetupPanel({ configured, redirecting, error, onConnect }: MailSetupPanelProps) {
  const [selected, setSelected] = useState<MailProviderId>("gmail");
  const selectedProvider = MAIL_PROVIDERS.find((provider) => provider.id === selected) ?? null;
  const canConnect = configured && selectedProvider?.available === true && !redirecting;

  /**
   * Submits the selected provider.
   *
   * @param event - Form submit event.
   * @returns Nothing.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (canConnect) onConnect();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-2 border-ink p-4 sm:p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em]">Why email?</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink/70">
          Blunter Bills reads new messages to find bills, invoices, and receipts. We request
          read-only access and never send, delete, or modify your email.
        </p>
        <ul className="mt-4 space-y-2 text-[11px] uppercase tracking-[0.12em] text-ink/60">
          <li>Subject, sender, and received date</li>
          <li>Message body, to identify bills</li>
          <li>Read-only access, revocable in your Google account</li>
        </ul>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]">Mail provider</p>
        <div role="radiogroup" aria-label="Mail provider" className="space-y-3">
          {MAIL_PROVIDERS.map((provider) => (
            <MailProviderCard
              key={provider.id}
              provider={provider}
              checked={selected === provider.id}
              onSelect={() => setSelected(provider.id)}
            />
          ))}
        </div>
      </div>

      {!configured ? (
        <Notice tone="error">
          Mail setup is not configured on the API. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to
          apps/api/.env.
        </Notice>
      ) : null}

      {error !== null ? <Notice tone="error">{error}</Notice> : null}

      <Button type="submit" disabled={!canConnect} className="w-full">
        {redirecting ? (
          <>
            <Spinner />
            Redirecting to Google
          </>
        ) : (
          "Connect Gmail"
        )}
      </Button>

      <p className="text-[11px] leading-relaxed text-ink/60">
        You will be redirected to Google to approve read-only access. Blunter Bills never sees your
        Google password.
      </p>
    </form>
  );
}
