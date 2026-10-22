"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, Clock, DollarSign, FileCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/states";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { executionStatusLabel } from "@/lib/status";
import { useApi } from "@/lib/use-api";
import { listProviderWork } from "@/lib/api/endpoints";

export function ProviderWorkList() {
  const { data, error, loading, reload } = useApi(() => listProviderWork(), []);

  if (loading && !data) return <LoadingState label="Loading assigned work & payouts..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load provider work"
        description="The server may be unreachable. Please check your connection."
        onRetry={reload}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No work assignments yet"
        description="Eligible assignments appear here once a work agreement is approved and your specialist profile is selected."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {data.map((w) => (
        <Card key={w.executionId} className="border-border/80 shadow-xs hover:border-primary/40 transition-all">
          <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">{w.taskTitle}</CardTitle>
                <CardDescription className="mt-1 max-w-2xl leading-relaxed text-xs sm:text-sm">
                  {w.taskRequest}
                </CardDescription>
              </div>
              <StatusBadge
                tone={
                  w.status === "COMPLETED"
                    ? "success"
                    : w.status === "REVISION_REQUESTED"
                      ? "attention"
                      : "progress"
                }
              >
                {executionStatusLabel(w.status)}
              </StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-4">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-semibold text-foreground text-sm font-mono">
                <DollarSign className="h-4 w-4 text-emerald-600 -mr-1" />
                {formatMinorMoney(w.pay)} Guaranteed Payout
              </span>
              <span className="flex items-center gap-1">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                {w.requirements.length} Verifiable Requirement(s)
              </span>
              {w.deadline ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Due {formatDateTime(w.deadline)}
                </span>
              ) : null}
            </div>
            <Button size="sm" asChild className="shadow-xs font-medium">
              <Link href={`/provider/${w.executionId}`}>
                <span>Open Work Room</span>
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
