/**
 * Inverted brand panel shown beside the authorization screens.
 *
 * @returns The brand panel.
 */
export function BrandPanel() {
  return (
    <aside className="flex min-h-[38vh] flex-col bg-ink text-paper lg:min-h-dvh">
      <div className="border-b-2 border-paper/20 px-5 py-4 sm:px-10">
        <span className="text-[11px] font-bold uppercase tracking-[0.32em]">Blunter Bills</span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-10 px-5 py-8 sm:px-10 sm:py-10">
        <div>
          <p className="max-w-lg font-sans text-5xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl lg:text-7xl">
            Money.
            <br />
            Straight up.
          </p>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-paper/70">
            Connect your bank and read the transactions. No budgets, no mascots, no noise.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-paper/20 pt-4 text-[10px] uppercase tracking-[0.18em] text-paper/60">
          <span>Enable Banking</span>
          <span aria-hidden="true">/</span>
          <span>PSD2</span>
          <span aria-hidden="true">/</span>
          <span>Read-only</span>
        </div>
      </div>
    </aside>
  );
}
