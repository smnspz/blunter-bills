import { Button } from "@/components/atoms/Button";
import { Notice } from "@/components/molecules/Notice";

interface ErrorPanelProps {
  message: string;
  onRetry: () => void;
}

/**
 * Inline error with a retry action.
 *
 * @param props - Error message and retry handler.
 * @returns The error panel.
 */
export function ErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <div className="space-y-4">
      <Notice tone="error">{message}</Notice>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
