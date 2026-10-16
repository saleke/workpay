import { Sparkles, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirementSourceLabel } from "@/lib/status";
import type { WorkSpecificationDto } from "@/lib/api/types";

export function WorkSpecification({ spec }: { spec: WorkSpecificationDto }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" /> What WorkPay understood
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {spec.planSource === "AI" ? "AI plan" : "Deterministic plan"}
          </Badge>
        </div>
        <CardDescription>{spec.summary}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="text-sm font-medium">Requirements ({spec.requirements.length})</div>
        <ul className="grid gap-2">
          {spec.requirements.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3"
            >
              <span className="text-sm">{r.statement}</span>
              <div className="flex shrink-0 gap-2">
                <Badge variant="secondary" className="text-xs">
                  {requirementSourceLabel(r.source)}
                </Badge>
                {r.acceptanceRelevant ? null : (
                  <Badge variant="outline" className="text-xs">
                    informational
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
