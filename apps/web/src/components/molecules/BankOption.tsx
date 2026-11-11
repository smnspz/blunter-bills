import { BankMark } from "@/components/atoms/BankMark";
import type { Aspsp } from "@/lib/api";
import { cn } from "@/lib/cn";

interface BankOptionProps {
  bank: Aspsp;
  checked: boolean;
  onSelect: () => void;
}

/**
 * Selectable bank row backed by a native radio input.
 *
 * @param props - Bank, selected state, and selection handler.
 * @returns The bank option row.
 */
export function BankOption({ bank, checked, onSelect }: BankOptionProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors",
        checked ? "bg-acid text-acid-ink" : "bg-paper hover:bg-ink/5",
      )}
    >
      <input
        type="radio"
        name="bank"
        value={bank.name}
        checked={checked}
        onChange={onSelect}
        className="size-4 shrink-0 appearance-none border-2 border-ink bg-paper checked:bg-ink"
      />
      <BankMark bank={bank} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{bank.name}</span>
        <span className="block text-[10px] uppercase tracking-[0.16em] opacity-70">
          {bank.country}
          {bank.beta === true ? " / beta" : ""}
        </span>
      </span>
    </label>
  );
}
