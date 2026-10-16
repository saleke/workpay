import { AlertTriangle, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { caseStatusLabel } from "@/lib/status";
import type { CaseDto } from "@/lib/api/types";

function severityTone(severity: CaseDto["severity"]) {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "danger" as const;
    case "MEDIUM":
      return "attention" as const;
    default:
      return "neutral" as const;
  }
}

export function CasesPanel({ cases }: { cases: CaseDto[] }) {
  if (cases.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" /> Human review
        </CardTitle>
        <CardDescription>Cases that need a person to decide.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {cases.map((c) => (
          <div key={c.id} className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.title}</span>
              <div className="flex items-center gap-2">
                <StatusBadge tone={severityTone(c.severity)}>
                  {c.severity.toLowerCase()}
                </StatusBadge>
                <StatusBadge tone={c.status === "RESOLVED" ? "success" : "attention"}>
                  {caseStatusLabel(c.status)}
                </StatusBadge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{c.summary}</p>
            {c.blocksPaymentCapture ? (
              <p className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> While open, payment capture is blocked.
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
