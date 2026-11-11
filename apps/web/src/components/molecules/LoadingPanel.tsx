import { Spinner } from "@/components/atoms/Spinner";

interface LoadingPanelProps {
  label: string;
}

/**
 * Bordered loading state with visible status text.
 *
 * @param props - Loading label.
 * @returns The loading panel.
 */
export function LoadingPanel({ label }: LoadingPanelProps) {
  return (
    <div role="status" className="flex items-center gap-3 border-2 border-ink px-4 py-6 text-sm">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
