import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Brutalist native select.
 *
 * @param props - Native select attributes.
 * @returns The select element.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full border-2 border-ink bg-paper px-4 py-3 font-mono text-sm text-ink",
        className,
      )}
      {...props}
    />
  );
}
