"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Flame,
  Milestone,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTaskAuditStatus, submitAuditCheckin } from "@/lib/api/endpoints";
import type { TaskAuditStatusDto } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

interface AuditorCheckinCardProps {
  taskId: string;
  onCheckinSubmitted?: () => void;
}

export function AuditorCheckinCard({ taskId, onCheckinSubmitted }: AuditorCheckinCardProps) {
  const [audit, setAudit] = useState<TaskAuditStatusDto | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<"ON_TRACK" | "MILESTONE_DRAFT" | "BLOCKED">("ON_TRACK");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAudit = async () => {
    const res = await getTaskAuditStatus(taskId);
    if (res.data) setAudit(res.data);
  };

  useEffect(() => {
    loadAudit();
  }, [taskId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await submitAuditCheckin(taskId, {
      status: selectedStatus,
      notes: notes.trim() || undefined,
    });

    setSubmitting(false);

    if (res.error) {
      setErrorMessage("Could not submit check-in. Please try again.");
      return;
    }

    setNotes("");
    setSuccessMessage("Your status check-in has been logged and shared with the task owner.");
    setTimeout(() => setSuccessMessage(null), 4000);
    await loadAudit();
    if (onCheckinSubmitted) onCheckinSubmitted();
  };

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              Autonomous Auditor Check-in
            </CardTitle>
          </div>
          {audit?.riskLevel === "ATTENTION" ? (
            <StatusBadge tone="attention">Attention Flagged</StatusBadge>
          ) : audit?.riskLevel === "OVERDUE" ? (
            <StatusBadge tone="attention">Deadline Overdue</StatusBadge>
          ) : (
            <StatusBadge tone="success">Active Audit Window</StatusBadge>
          )}
        </div>
        <CardDescription className="text-xs sm:text-sm">
          Keep the delivery on schedule. Submit continuous status updates so the Autonomous Auditor and Task Owner have full visibility into your progress.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {audit ? (
          <div className="rounded-xl border bg-muted/20 p-3.5 grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <span>Deadline Burn-down ({audit.burnDownPercentage}%)</span>
              </span>
              <span className="font-mono text-muted-foreground text-[11px]">
                {audit.timeRemainingHours !== null ? (
                  audit.timeRemainingHours > 0 ? (
                    `${audit.timeRemainingHours}h remaining`
                  ) : (
                    <span className="text-destructive font-semibold">
                      {Math.abs(audit.timeRemainingHours)}h past deadline
                    </span>
                  )
                ) : (
                  "Open schedule"
                )}
              </span>
            </div>
            <Progress value={audit.burnDownPercentage} className="h-2" />
          </div>
        ) : null}

        {/* 3 Status selection pills */}
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Select Your Current Status
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSelectedStatus("ON_TRACK")}
              className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                selectedStatus === "ON_TRACK"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/20"
                  : "border-border hover:bg-muted/40 text-muted-foreground"
              }`}
            >
              <CheckCircle2
                className={`h-4 w-4 shrink-0 ${
                  selectedStatus === "ON_TRACK" ? "text-emerald-600 dark:text-emerald-400" : ""
                }`}
              />
              <div>
                <div className="text-xs font-semibold">On Track</div>
                <div className="text-[11px] opacity-80">Advancing to plan</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus("MILESTONE_DRAFT")}
              className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                selectedStatus === "MILESTONE_DRAFT"
                  ? "border-blue-500 bg-blue-500/10 text-blue-950 dark:text-blue-100 ring-2 ring-blue-500/20"
                  : "border-border hover:bg-muted/40 text-muted-foreground"
              }`}
            >
              <Milestone
                className={`h-4 w-4 shrink-0 ${
                  selectedStatus === "MILESTONE_DRAFT" ? "text-blue-600 dark:text-blue-400" : ""
                }`}
              />
              <div>
                <div className="text-xs font-semibold">Milestone Draft</div>
                <div className="text-[11px] opacity-80">Draft ready to review</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus("BLOCKED")}
              className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                selectedStatus === "BLOCKED"
                  ? "border-amber-500 bg-amber-500/10 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/20"
                  : "border-border hover:bg-muted/40 text-muted-foreground"
              }`}
            >
              <AlertCircle
                className={`h-4 w-4 shrink-0 ${
                  selectedStatus === "BLOCKED" ? "text-amber-600 dark:text-amber-400" : ""
                }`}
              />
              <div>
                <div className="text-xs font-semibold">Blocked</div>
                <div className="text-[11px] opacity-80">Need input or guidance</div>
              </div>
            </button>
          </div>
        </div>

        {/* Notes textarea */}
        <div className="grid gap-2">
          <Textarea
            placeholder="Progress notes, draft preview links, or details on what is blocking you (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs sm:text-sm resize-none"
          />
        </div>

        {errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}

        {successMessage ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            <Send className="mr-2 h-3.5 w-3.5" />
            {submitting ? "Submitting Check-in..." : "Submit Auditor Check-in"}
          </Button>

          {audit?.latestCheckin ? (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3" />
              <span>Last: {audit.latestCheckin.status} ({formatDateTime(audit.latestCheckin.createdAt)})</span>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
