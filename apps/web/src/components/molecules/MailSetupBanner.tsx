import { Button } from "@/components/atoms/Button";

interface MailSetupBannerProps {
  onConnect: () => void;
}

/**
 * Dashboard prompt shown when no mailbox is connected.
 *
 * @param props - Connect handler.
 * @returns The mail setup banner.
 */
export function MailSetupBanner({ onConnect }: MailSetupBannerProps) {
  return (
    <div className="flex flex-col gap-4 border-2 border-ink bg-acid p-4 text-acid-ink sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]">Email not connected</p>
        <p className="mt-1 text-sm">Connect your inbox so Blunter Bills can find new bills.</p>
      </div>
      <Button onClick={onConnect}>Connect email</Button>
    </div>
  );
}
