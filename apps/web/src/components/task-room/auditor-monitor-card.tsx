"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Milestone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTaskAuditStatus } from "@/lib/api/endpoints";
import type { TaskAuditStatusDto } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

interface AuditorMonitorCardProps {
  taskId: string;
}

export function AuditorMonitorCard({ taskId }: AuditorMonitorCardProps) {
  const [audit, setAudit] = useState<TaskAuditStatusDto | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAudit = async () => {
    setLoading(true);
    const res = await getTaskAuditStatus(taskId);
    setLoading(false);
    if (res.data) {
      setAudit(res.data);
    }
  };

  useEffect(() => {
    fetchAudit();
    const interval = setInterval(fetchAudit, 15000);
    return () => clearInterval(interval);
  }, [taskId]);

  const phaseLabels: Record<TaskAuditStatusDto["phase"], string> = {
    KICKOFF: "Phase 1: Kickoff & Alignment",
    PROGRESS_AUDIT: "Phase 2: Milestone Execution & Progress Audit",
    CRITICAL_PATH: "Phase 3: Critical Path Delivery",
    FINAL_COUNTDOWN: "Phase 4: Final Countdown & Pre-verification",
  };

  const riskBadge = (risk: TaskAuditStatusDto["riskLevel"]) => {
    switch (risk) {
      case "LOW":
        return <StatusBadge tone="success">Velocity Normal</StatusBadge>;
      case "ATTENTION":
        return <StatusBadge tone="attention">Attention Required</StatusBadge>;
      case "OVERDUE":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </span>
        );
      default:
        return null;
    }
  };

  const checkinStatusIcon = (status: "ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED") => {
    switch (status) {
      case "ON_TRACK":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "MILESTONE_DRAFT":
        return <Milestone className="h-4 w-4 text-blue-500 shrink-0" />;
      case "BLOCKED":
        return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />;
    }
  };

  const checkinStatusText = (status: "ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED") => {
    switch (status) {
      case "ON_TRACK":
        return "On Track & Advancing";
      case "MILESTONE_DRAFT":
        return "Milestone Draft Ready";
      case "BLOCKED":
        return "Blocked: Needs Guidance";
    }
  };

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              Autonomous Auditor &amp; Follow-up Monitor
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {audit ? riskBadge(audit.riskLevel) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAudit}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          WorkPay does not wait passively. The Autonomous Auditor actively tracks deadline burn-down, collects milestone check-ins, and escalates early if delivery risks appear.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {audit ? (
          <>
            {/* Burn-down bar */}
            <div className="rounded-xl border bg-muted/20 p-4 grid gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-amber-500" />
                  <span>{phaseLabels[audit.phase]}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {audit.timeRemainingHours !== null ? (
                    audit.timeRemainingHours > 0 ? (
                      `${audit.timeRemainingHours} hours remaining`
                    ) : (
                      <span className="text-destructive font-semibold">
                        {Math.abs(audit.timeRemainingHours)} hours past deadline
                      </span>
                    )
                  ) : (
                    "No fixed deadline"
                  )}
                </span>
              </div>

              <Progress value={audit.burnDownPercentage} className="h-2" />

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Burn-down elapsed: {audit.burnDownPercentage}%</span>
                <span>
                  {audit.deadline ? `Target: ${formatDateTime(audit.deadline)}` : "Open window"}
                </span>
              </div>
            </div>

            {/* Latest checkin or prompt */}
            <div className="grid gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>Specialist Check-in Feed</span>
              </div>

              {audit.checkins.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No check-ins logged yet. The assigned specialist will report status updates directly from Work Studio.
                </div>
              ) : (
                <div className="grid gap-2">
                  {audit.checkins.map((checkin) => (
                    <div
                      key={checkin.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border bg-card p-3 text-xs shadow-2xs"
                    >
                      <div className="flex items-start gap-2.5">
                        {checkinStatusIcon(checkin.status)}
                        <div>
                          <div className="font-medium text-foreground">
                            {checkinStatusText(checkin.status)}
                          </div>
                          {checkin.notes ? (
                            <p className="mt-0.5 text-muted-foreground leading-relaxed">
                              {checkin.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap self-end sm:self-center font-mono">
                        {formatDateTime(checkin.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground py-2">
            Synchronizing auditor telemetry...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
