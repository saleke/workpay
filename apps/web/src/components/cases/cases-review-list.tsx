"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { formatDateTime } from "@/lib/format";
import { caseStatusLabel } from "@/lib/status";
import { useApi } from "@/lib/use-api";
import { listCases, resolveCase } from "@/lib/api/endpoints";
import type { CaseDto } from "@/lib/api/types";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

export function CasesReviewList() {
  const { data, error, loading, reload } = useApi(() => listCases(), []);
  const [resolving, setResolving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const resolve = useCallback(
    async (caseId: string, outcome: string) => {
      setResolving(caseId);
      setErr(null);
      const res = await resolveCase(caseId, { outcome }, newIdempotencyKey());
      setResolving(null);
      if (res.error) {
        const msg = "Could not resolve this case.";
        setErr(msg);
        toast.error(msg);
      } else {
        toast.success(`Case resolved: ${outcome}`);
        reload();
      }
    },
    [reload],
  );

  if (loading && !data) return <LoadingState label="Loading cases..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load cases"
        description="Cases may require admin/reviewer access."
        onRetry={reload}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No open cases"
        description="Cases opened for UNCERTAIN verification or exceptions will appear here."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {data.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-4 w-4" />
                {c.title}
              </CardTitle>
              <div className="flex items-center gap-2">
                <StatusBadge tone={severityTone(c.severity)}>{c.severity.toLowerCase()}</StatusBadge>
                <StatusBadge tone={c.status === "RESOLVED" ? "success" : "attention"}>
                  {caseStatusLabel(c.status)}
                </StatusBadge>
              </div>
            </div>
            <CardDescription>{c.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="text-xs text-muted-foreground">
              Task {c.taskId} · Opened {formatDateTime(c.createdAt)}
              {c.blocksPaymentCapture ? (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> Blocks capture
                </span>
              ) : null}
            </div>
            {c.status !== "RESOLVED" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolving === c.id}
                  onClick={() => resolve(c.id, "REQUIRE_REVISION")}
                >
                  Require revision
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolving === c.id}
                  onClick={() => resolve(c.id, "RELEASE_PAYMENT")}
                >
                  Release payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolving === c.id}
                  onClick={() => resolve(c.id, "UPHOLD_SYSTEM_DECISION")}
                >
                  Uphold decision
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Resolved.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
