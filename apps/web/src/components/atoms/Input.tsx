import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Brutalist text input.
 *
 * @param props - Native input attributes.
 * @returns The input element.
 */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full border-2 border-ink bg-paper px-4 py-3 font-mono text-sm text-ink",
        "placeholder:text-ink/60 focus:shadow-brutal-sm",
        className,
      )}
      {...props}
    />
  );
}
