import { Star, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMinorMoney } from "@/lib/format";
import type { ProviderSelectionDto, ProviderSnapshotDto } from "@/lib/api/types";

function ProviderCard({ provider }: { provider: ProviderSnapshotDto }) {
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{provider.displayName}</span>
        {typeof provider.priceMinor === "number" && provider.currency ? (
          <Badge variant="secondary">
            {formatMinorMoney({ amountMinor: provider.priceMinor, currency: provider.currency })}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {typeof provider.firstPassAcceptancePct === "number" ? (
          <span>{provider.firstPassAcceptancePct}% first-pass acceptance</span>
        ) : null}
        {typeof provider.onTimeRatePct === "number" ? (
          <span>{provider.onTimeRatePct}% on time</span>
        ) : null}
        {typeof provider.completedTasks === "number" ? (
          <span>{provider.completedTasks} tasks completed</span>
        ) : null}
      </div>
    </div>
  );
}

export function ProviderRecommendation({ selection }: { selection: ProviderSelectionDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Recommended provider
        </CardTitle>
        <CardDescription>Why WorkPay selected them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {selection.status === "SELECTED" && selection.provider ? (
          <>
            <ProviderCard provider={selection.provider} />
            {selection.reason ? (
              <p className="text-sm text-muted-foreground">{selection.reason}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {selection.reason ?? "No eligible provider was found."}
          </p>
        )}

        {selection.alternatives.length > 0 ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="inline-flex items-center gap-2">
                <Star className="h-3.5 w-3.5" />
                {selection.alternatives.length} alternative
                {selection.alternatives.length === 1 ? "" : "s"} considered
              </span>
            </summary>
            <div className="mt-3 grid gap-2">
              {selection.alternatives.map((alt) => (
                <ProviderCard key={alt.providerId} provider={alt} />
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
