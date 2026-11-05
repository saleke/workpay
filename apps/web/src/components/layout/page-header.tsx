import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-[var(--wp-border)] pb-5 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--wp-accent)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--wp-text-primary)] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <div className="mt-1.5 text-sm leading-6 text-[var(--wp-text-secondary)]">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
