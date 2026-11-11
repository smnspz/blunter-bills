import { cn } from "@/lib/cn";

interface SpinnerProps {
  className?: string;
}

/**
 * Decorative loading spinner. Pair it with visible status text.
 *
 * @param props - Optional extra classes.
 * @returns The spinner element.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
