import { Button } from "@/components/atoms/Button";
import type { Session } from "@/lib/api";
import { accountCountLabel, formatDate } from "@/lib/format";

interface WelcomePanelProps {
  session: Session;
  onRefresh: () => void;
}

/**
 * Placeholder dashboard showing the active connection summary.
 *
 * @param props - Stored session and refresh handler.
 * @returns The welcome panel.
 */
export function WelcomePanel({ session, onRefresh }: WelcomePanelProps) {
  return (
    <section className="border-2 border-ink">
      <div className="border-b-2 border-ink bg-acid p-6 text-acid-ink sm:p-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em]">Connected</p>
        <h1 className="mt-3 font-sans text-4xl font-black uppercase leading-none tracking-tighter sm:text-6xl">
          Welcome back.
        </h1>
      </div>

      <div className="space-y-8 p-6 sm:p-10">
        <p className="max-w-xl text-sm leading-relaxed text-ink/70">
          Your dashboard is empty for now. Transactions, filters, and the rest come next.
        </p>

        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="border-2 border-ink p-4">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-ink/60">Bank</dt>
            <dd className="mt-1 text-sm font-bold">{session.aspsp.name}</dd>
          </div>
          <div className="border-2 border-ink p-4">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-ink/60">Accounts</dt>
            <dd className="mt-1 text-sm font-bold">{accountCountLabel(session.accounts.length)}</dd>
          </div>
          <div className="border-2 border-ink p-4">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-ink/60">Consent until</dt>
            <dd className="mt-1 text-sm font-bold">{formatDate(session.access_valid_until)}</dd>
          </div>
        </dl>

        <Button variant="secondary" onClick={onRefresh}>
          Refresh session
        </Button>
      </div>
    </section>
  );
}
