import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Uppercase form label.
 *
 * @param props - Native label attributes.
 * @returns The label element.
 */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-ink",
        className,
      )}
      {...props}
    />
  );
}
