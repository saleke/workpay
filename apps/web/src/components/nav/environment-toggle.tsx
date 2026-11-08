import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export function EnvironmentToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Simulated payment environment; no funds move"
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-xl border border-[var(--wp-accent)]/15 bg-[var(--wp-accent-subtle)] px-3 text-xs font-medium text-[var(--wp-accent)]",
        compact && "min-h-10 w-10 justify-center px-0",
        className,
      )}
      title="Simulated payment environment; no funds are held, charged, or paid."
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={cn(compact ? "sr-only" : "whitespace-nowrap")}>Simulated payments</span>
    </div>
  );
}
