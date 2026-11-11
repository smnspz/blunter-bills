import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Dashboard shell with a compact header and footer.
 *
 * @param props - Page content.
 * @returns The dashboard layout.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Blunter Bills</span>
          <span className="border-2 border-paper/30 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-paper/70">
            Dashboard
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>

      <footer className="border-t-2 border-ink px-4 py-4 text-[10px] uppercase tracking-[0.18em] text-ink/70 sm:px-6">
        Enable Banking / Read-only access
      </footer>
    </div>
  );
}
