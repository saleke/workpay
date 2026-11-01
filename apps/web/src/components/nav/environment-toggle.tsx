import { FlaskConical } from "lucide-react";

export function EnvironmentToggle() {
  return (
    <div
      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-accent-subtle)] px-2.5 text-xs font-medium text-[var(--wp-accent)]"
      title="Payment behavior is simulated; no funds move."
    >
      <FlaskConical className="h-3.5 w-3.5" />
      <span>Simulated Payments</span>
    </div>
  );
}
