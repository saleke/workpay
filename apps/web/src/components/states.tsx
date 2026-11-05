import { FolderGit2, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <Card className="border-[var(--wp-border)] bg-[var(--wp-surface)] shadow-xs" role="status">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="relative flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--wp-border)] border-t-[var(--wp-accent)] motion-reduce:animate-none" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--wp-text-primary)]">{label}</p>
          <p className="text-xs text-[var(--wp-text-secondary)]">This should only take a moment.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed border-[var(--wp-border-strong)] bg-[var(--wp-surface-subtle)] shadow-none">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]">
          <FolderGit2 className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-[var(--wp-text-primary)]">{title}</p>
          {description ? (
            <p className="max-w-md text-sm text-[var(--wp-text-secondary)]">{description}</p>
          ) : null}
        </div>
        {action ? <div className="mt-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Card
      className="border-[var(--wp-danger)]/30 bg-[var(--wp-danger-subtle)] shadow-xs"
      role="alert"
      aria-live="assertive"
    >
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[var(--wp-danger)]">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-[var(--wp-danger)]">{title}</p>
          {description ? (
            <p className="max-w-md text-sm text-[var(--wp-text-secondary)]">{description}</p>
          ) : null}
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
