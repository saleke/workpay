import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">{label}</p>
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
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
        {action}
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
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
