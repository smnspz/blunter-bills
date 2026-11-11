import type { ReactNode } from "react";
import { Label } from "@/components/atoms/Label";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}

/**
 * Label, control, and optional hint grouped as one form field.
 *
 * @param props - Field id, label, optional hint, and control.
 * @returns The field block.
 */
export function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint !== undefined ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink/60">{hint}</p>
      ) : null}
    </div>
  );
}
