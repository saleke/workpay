"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Play, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMinorMoney, formatDateTime } from "@/lib/format";
import { executionStatusLabel } from "@/lib/status";
import {
  acceptProviderWork,
  startProviderWork,
  submitDeliverable,
} from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";
import { AuditorCheckinCard } from "./auditor-checkin-card";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProviderWorkDetail({
  work,
  onChanged,
}: {
  work: ProviderWorkDto;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(async () => {
    setBusy("accept");
    setError(null);
    const res = await acceptProviderWork(work.executionId, newIdempotencyKey());
    setBusy(null);
    if (res.error) {
      const err = "Could not accept this work. It may have changed.";
      setError(err);
      toast.error(err);
    } else {
      toast.success("Assignment accepted! Escrow authorization locked in PayPal.");
      onChanged();
    }
  }, [work.executionId, onChanged]);

  const start = useCallback(async () => {
    setBusy("start");
    setError(null);
    const res = await startProviderWork(work.executionId, newIdempotencyKey());
    setBusy(null);
    if (res.error) {
      const err = "Could not start this work.";
      setError(err);
      toast.error(err);
    } else {
      toast.success("Execution started. Status updated to in progress.");
      onChanged();
    }
  }, [work.executionId, onChanged]);

  const submit = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      const err = "Choose a file to submit.";
      setError(err);
      toast.error(err);
      return;
    }
    setBusy("submit");
    setError(null);
    const res = await submitDeliverable(work.executionId, file, note.trim(), newIdempotencyKey());
    setBusy(null);
    if (res.error) {
      const err = "The submission could not be recorded. Please try again.";
      setError(err);
      toast.error(err);
    } else {
      toast.success("Deliverable submitted! Automated verification against Definition of Done initiated.");
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
    }
  }, [work.executionId, note, onChanged]);

  const canAccept = work.status === "ASSIGNED";
  const canStart = work.status === "ACCEPTED" || work.status === "REVISION_REQUESTED";
  const canSubmit =
    work.status === "ACCEPTED" ||
    work.status === "IN_PROGRESS" ||
    work.status === "REVISION_REQUESTED";

  return (
    <div className="grid gap-4">
      {work.revisionReason ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">A revision was requested</div>
            <p>{work.revisionReason}</p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{work.taskTitle}</CardTitle>
            <StatusBadge
              tone={
                work.status === "COMPLETED"
                  ? "success"
                  : work.status === "REVISION_REQUESTED"
                    ? "attention"
                    : "progress"
              }
            >
              {executionStatusLabel(work.status)}
            </StatusBadge>
          </div>
          <CardDescription>{work.taskRequest}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Pay on acceptance</div>
              <div className="mt-1 text-lg font-semibold">
                {formatMinorMoney(work.pay)}
              </div>
              <div className="text-xs text-muted-foreground">
                Held in authorization; released after verification passes.
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase text-muted-foreground">Deadline</div>
              <div className="mt-1 text-sm font-medium">
                {work.deadline ? formatDateTime(work.deadline) : "Not specified"}
              </div>
            </div>
          </div>

          <Separator />

          <AuditorCheckinCard taskId={work.taskId} onCheckinSubmitted={onChanged} />

          <Separator />

          <div className="grid gap-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Definition of Done (Criteria for Completion)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              These criteria are strictly validated by automated checks and evaluation before payment releases.
            </p>
            <ul className="grid gap-2 mt-1">
              {work.requirements.map((r) => (
                <li key={r.key} className="flex items-start gap-2.5 rounded-md border p-2.5 text-sm bg-muted/20">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 shrink-0" />
                  <span className="leading-relaxed">{r.statement}</span>
                </li>
              ))}
            </ul>
          </div>

          {work.inputFiles.length > 0 ? (
            <>
              <Separator />
              <div className="grid gap-2">
                <div className="text-sm font-medium">Input files</div>
                <ul className="grid gap-1.5">
                  {work.inputFiles.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{f.filename}</span>
                      {f.downloadUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={f.downloadUrl} target="_blank" rel="noreferrer">
                            <Download className="mr-2 h-3.5 w-3.5" />
                            Download
                          </a>
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            {canAccept ? (
              <Button onClick={accept} disabled={busy !== null}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {busy === "accept" ? "Accepting..." : "Accept work"}
              </Button>
            ) : null}
            {canStart ? (
              <Button variant="secondary" onClick={start} disabled={busy !== null}>
                <Play className="mr-2 h-4 w-4" />
                {busy === "start" ? "Starting..." : "Start work"}
              </Button>
            ) : null}
          </div>

          {canSubmit ? (
            <>
              <Separator />
              <div className="grid gap-3">
                <div className="text-sm font-medium">Submit a deliverable</div>
                <p className="text-xs text-muted-foreground">
                  Each submission is stored as an immutable new version with a checksum. A
                  re-upload never overwrites a previous version.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
                />
                <Textarea
                  placeholder="Note for the task owner (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <Button onClick={submit} disabled={busy !== null} className="w-fit">
                  <FileUp className="mr-2 h-4 w-4" />
                  {busy === "submit" ? "Submitting..." : "Submit deliverable"}
                </Button>
              </div>
            </>
          ) : null}

          {work.latestSubmission ? (
            <>
              <Separator />
              <div className="grid gap-1 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Send className="h-3.5 w-3.5" /> Latest submission (v
                  {work.latestSubmission.version})
                </div>
                <div className="text-xs text-muted-foreground">
                  {work.latestSubmission.artifacts
                    .map((a) => `${a.filename} (${a.checksum.slice(0, 8)}…)`)
                    .join(", ") || "No artifacts"}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
