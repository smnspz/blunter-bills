import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface NoticeProps {
  tone?: "info" | "error";
  children: ReactNode;
}

/**
 * Inline informational or error message.
 *
 * @param props - Tone and content.
 * @returns The notice element.
 */
export function Notice({ tone = "info", children }: NoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "border-2 px-4 py-3 text-xs leading-relaxed",
        tone === "error" ? "border-danger text-danger" : "border-ink bg-ink/5 text-ink",
      )}
    >
      {children}
    </div>
  );
}
