import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-transparent bg-muted text-muted-foreground",
  progress: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  attention: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  success:
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  danger: "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
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
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
