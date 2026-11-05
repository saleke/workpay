import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  neutral: {
    badge:
      "border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)]",
    dot: "bg-[var(--wp-text-muted)]",
  },
  progress: {
    badge: "border-[var(--wp-info)]/20 bg-[var(--wp-info-subtle)] text-[var(--wp-info)]",
    dot: "bg-[var(--wp-info)] animate-pulse",
  },
  attention: {
    badge:
      "border-[var(--wp-warning)]/20 bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]",
    dot: "bg-[var(--wp-warning)]",
  },
  success: {
    badge:
      "border-[var(--wp-success)]/20 bg-[var(--wp-success-subtle)] text-[var(--wp-success)]",
    dot: "bg-[var(--wp-success)]",
  },
  danger: {
    badge: "border-[var(--wp-danger)]/20 bg-[var(--wp-danger-subtle)] text-[var(--wp-danger)]",
    dot: "bg-[var(--wp-danger)]",
  },
};

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const config = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide shadow-sm transition-all",
        config.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {children}
    </span>
  );
}
