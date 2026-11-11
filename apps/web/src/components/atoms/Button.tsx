import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Brutalist button with a hard shadow and press feedback.
 *
 * @param props - Native button attributes plus an optional visual variant.
 * @returns The button element.
 */
export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 border-2 border-ink px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.16em] transition-transform duration-100",
        "shadow-brutal-sm hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        variant === "primary" && "bg-ink text-paper",
        variant === "secondary" && "bg-paper text-ink",
        className,
      )}
      {...props}
    />
  );
}
