"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
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

  if (loading && !data) return <LoadingState label="Loading your work..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load provider work"
        description="The server may be unreachable."
        onRetry={reload}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No work available"
        description="You will see eligible assignments here once a buyer approves a contract and a provider is matched."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {data.map((w) => (
        <Card key={w.executionId}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{w.taskTitle}</CardTitle>
                <CardDescription>{w.taskRequest}</CardDescription>
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
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Pay {formatMinorMoney(w.pay)}</span>
              {w.deadline ? <span>Due {formatDateTime(w.deadline)}</span> : null}
              <span>{w.requirements.length} requirement(s)</span>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/provider/${w.executionId}`}>
                Open <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
