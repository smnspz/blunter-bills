import { useState } from "react";
import type { Aspsp } from "@/lib/api";
import { cn } from "@/lib/cn";

interface BankMarkProps {
  bank: Aspsp;
  className?: string;
}

/**
 * Bank logo with an initials fallback.
 *
 * @param props - Bank and optional extra classes.
 * @returns A decorative bank mark.
 */
export function BankMark({ bank, className }: BankMarkProps) {
  const [showLogo, setShowLogo] = useState(bank.logo !== undefined);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center border-2 border-ink bg-paper text-[10px] font-black uppercase",
        className,
      )}
    >
      {showLogo && bank.logo !== undefined ? (
        <img
          src={bank.logo}
          alt=""
          loading="lazy"
          className="size-5 object-contain grayscale"
          onError={() => setShowLogo(false)}
        />
      ) : (
        bank.name.slice(0, 2)
      )}
    </span>
  );
}
