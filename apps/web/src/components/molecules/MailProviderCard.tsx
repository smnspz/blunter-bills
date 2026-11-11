import type { MailProviderOption } from "@/lib/mail-providers";
import { cn } from "@/lib/cn";

interface MailProviderCardProps {
  provider: MailProviderOption;
  checked: boolean;
  onSelect: () => void;
}

/**
 * Selectable mail provider row backed by a native radio input.
 *
 * @param props - Provider, selected state, and selection handler.
 * @returns The provider row.
 */
export function MailProviderCard({ provider, checked, onSelect }: MailProviderCardProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 border-2 border-ink px-3 py-3 transition-colors",
        provider.available ? "cursor-pointer" : "cursor-not-allowed opacity-50",
        checked ? "bg-acid text-acid-ink" : "bg-paper",
        provider.available && !checked && "hover:bg-ink/5",
      )}
    >
      <input
        type="radio"
        name="mail-provider"
        value={provider.id}
        checked={checked}
        onChange={onSelect}
        disabled={!provider.available}
        className="mt-1 size-4 shrink-0 appearance-none border-2 border-ink bg-paper checked:bg-ink disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center border-2 border-ink bg-paper text-[10px] font-black uppercase"
      >
        {provider.monogram}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-bold">{provider.name}</span>
          <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">
            {provider.available ? "Available" : "Coming soon"}
          </span>
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed opacity-80">
          {provider.description}
        </span>
      </span>
    </label>
  );
}
