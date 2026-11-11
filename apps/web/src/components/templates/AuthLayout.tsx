import type { ReactNode } from "react";
import { BrandPanel } from "@/components/organisms/BrandPanel";

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Two-column authorization layout: brand panel plus form area.
 *
 * @param props - Page content for the form area.
 * @returns The authorization layout.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <main className="flex items-start justify-center bg-paper px-5 py-10 sm:px-10 lg:items-center lg:px-14">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
