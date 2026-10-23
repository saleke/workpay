"use client";

import { useCallback, useRef, useState } from "react";
import {
  Coins,
  FileCheck,
  FileText,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState, ErrorState } from "@/components/states";
import { formatMinorMoney } from "@/lib/format";
import { taskStatusLabel, taskStatusTone } from "@/lib/status";
import { useApi } from "@/lib/use-api";
import { useEventStream } from "@/lib/use-event-stream";
import {
  approveContract,
  getTaskActivity,
  getTaskPayment,
  getTaskRoom,
  getSubmissionVerification,
  requestPlanning,
  startProviderSearch,
} from "@/lib/api/endpoints";
import type { VerificationDto } from "@/lib/api/types";
import { ActivityTimeline } from "./activity-timeline";
import { AuditorMonitorCard } from "./auditor-monitor-card";
import { CasesPanel } from "./cases-panel";
import { ContractReview } from "./contract-review";
import { InviteSpecialistCard } from "./invite-specialist-card";
import { PaymentPanel } from "./payment-panel";
import { ProviderRecommendation } from "./provider-recommendation";
import { VerificationView } from "./verification-view";
import { WorkSpecification } from "./work-specification";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TaskRoom({ taskId }: { taskId: string }) {
  const room = useApi(() => getTaskRoom(taskId), [taskId]);
  const activity = useApi(() => getTaskActivity(taskId), [taskId]);
  const payment = useApi(() => getTaskPayment(taskId), [taskId]);

  const submissionId = room.data?.execution?.latestSubmission?.id ?? null;
  const verification = useApi<VerificationDto>(
    () =>
      submissionId
        ? getSubmissionVerification(submissionId)
        : Promise.resolve({ data: null, error: null }),
    [submissionId],
  );

  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    room.reload();
    activity.reload();
    payment.reload();
    verification.reload();
  }, [room, activity, payment, verification]);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refresh();
    }, 350);
  }, [refresh]);

  // Live updates with a cursor fallback if the stream drops (plan section 4).
  const stream = useEventStream({
    url: `/api/v1/tasks/${taskId}/events`,
    withSince: true,
    onEvent: debouncedRefresh,
  });

  const onApprove = useCallback(
    async (expectedHash: string) => {
      if (!room.data?.activeContract) return;
      setApproving(true);
      setActionError(null);
      const res = await approveContract(
        room.data.activeContract.id,
        expectedHash,
        newIdempotencyKey(),
      );
      setApproving(false);
      if (res.error) {
        setActionError(
          "This contract changed since you reviewed it, or the approval could not be recorded. Please refresh and review again.",
        );
        return;
      }
      refresh();
    },
    [room, refresh],
  );

  const runPlanning = useCallback(async () => {
    setActionError(null);
    const res = await requestPlanning(taskId);
    if (res.error) setActionError("Planning could not be started. Please try again.");
    refresh();
  }, [taskId, refresh]);

  const runProviderSearch = useCallback(async () => {
    setActionError(null);
    const res = await startProviderSearch(taskId);
    if (res.error) setActionError("Provider search could not be started.");
    refresh();
  }, [taskId, refresh]);

  if (room.loading && !room.data) return <LoadingState label="Opening task room & synchronizing ledger..." />;
  if (room.error && !room.data) {
    return (
      <ErrorState
        title="We could not open this task"
        description="The task may not exist, or you may not have access to it."
        onRetry={room.reload}
      />
    );
  }
  if (!room.data) return <ErrorState title="Task not found" />;

  const { task, activeContract, workSpecification, providerSelection, execution, cases } =
    room.data;

  const needsPlanning =
    !workSpecification && (task.status === "CREATED" || task.status === "PLANNING");
  const canSearchProviders = task.status === "APPROVED" && !providerSelection;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero Task Header */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-blue-50/30 dark:to-blue-950/20 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                {task.title}
              </h1>
              <StatusBadge tone={taskStatusTone(task.status)}>
                {taskStatusLabel(task.status)}
              </StatusBadge>
              {stream.connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live SSE
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
              {task.rawRequest}
            </p>
          </div>

          {/* Budget & Escrow Pill */}
          <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-border/60">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Authorized Ceiling
            </div>
            <div className="text-2xl font-extrabold text-foreground font-mono">
              {formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency })}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-primary font-medium">
              <Lock className="h-3 w-3" />
              <span>PayPal Escrow Protected</span>
            </div>
          </div>
        </div>

        {activeContract?.contractHash ? (
          <div className="mt-4 pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>SHA-256 Agreement Hash:</span>
              <code className="bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
                {activeContract.contractHash.slice(0, 16)}...{activeContract.contractHash.slice(-8)}
              </code>
            </span>
            <span className="text-[11px]">Approved with Cryptographic Zero-Tamper Seal</span>
          </div>
        ) : null}
      </div>

      {actionError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {/* 4 Mission-Critical Tabs */}
      <Tabs defaultValue="outcome" className="w-full">
        <TabsList className="grid w-full grid-cols-4 p-1 bg-muted/60 rounded-xl h-12">
          <TabsTrigger value="outcome" className="flex items-center gap-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <FileCheck className="h-4 w-4" />
            <span>Outcome &amp; Work Agreement</span>
          </TabsTrigger>
          <TabsTrigger value="state" className="flex items-center gap-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Workflow className="h-4 w-4" />
            <span>Agent State &amp; Match</span>
          </TabsTrigger>
          <TabsTrigger value="evidence" className="flex items-center gap-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            <span>Verification Proofs</span>
          </TabsTrigger>
          <TabsTrigger value="money" className="flex items-center gap-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Coins className="h-4 w-4" />
            <span>PayPal Money Ledger</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outcome" className="mt-6 grid gap-4">
          {needsPlanning ? (
            <Card className="border-border/70 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Synthesize Work Specification</CardTitle>
                <CardDescription>
                  WorkPay turns this raw request into a machine-verifiable specification and draft contract.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={runPlanning} className="bg-primary text-primary-foreground font-medium shadow-sm">
                  <Sparkles className="mr-2 h-4 w-4" /> Run Autonomous Planner
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {workSpecification ? <WorkSpecification spec={workSpecification} /> : null}
          {activeContract ? (
            <ContractReview
              contract={activeContract}
              specRequirements={workSpecification?.requirements ?? []}
              onApprove={onApprove}
              approving={approving}
              onContractUpdated={debouncedRefresh}
            />
          ) : (
            <Card className="border-border/70 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Work Agreement Draft</CardTitle>
                <CardDescription>No work agreement has been drafted yet.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="state" className="mt-6 grid gap-4">
          <InviteSpecialistCard taskId={taskId} isAssigned={!!execution} />
          {canSearchProviders ? (
            <Card className="border-border/70 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Match Provider</CardTitle>
                <CardDescription>
                  The contract is approved. WorkPay can now deterministically score and recommend an eligible provider.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={runProviderSearch} className="bg-primary text-primary-foreground font-medium shadow-sm">
                  <Search className="mr-2 h-4 w-4" /> Run Provider Selection Algorithm
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {providerSelection ? <ProviderRecommendation selection={providerSelection} /> : null}
          {execution ? (
            <>
              <Card className="border-border/70 shadow-xs">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">Active Execution</CardTitle>
                    <StatusBadge tone={execution.status === "COMPLETED" ? "success" : "progress"}>
                      {execution.status}
                    </StatusBadge>
                  </div>
                  <CardDescription>
                    Provider is assigned and working. Deliverable submissions are evaluated on upload:{" "}
                    {execution.latestSubmission
                      ? `Latest submission version ${execution.latestSubmission.version} (${execution.latestSubmission.status})`
                      : "No submission uploaded yet"}
                    .
                  </CardDescription>
                </CardHeader>
              </Card>
              <AuditorMonitorCard taskId={taskId} />
            </>
          ) : null}
          <ActivityTimeline entries={activity.data ?? []} />
        </TabsContent>

        <TabsContent value="evidence" className="mt-6 grid gap-4">
          <CasesPanel cases={cases} />
          {verification.data ? (
            <VerificationView verification={verification.data} />
          ) : (
            <Card className="border-border/70 shadow-xs">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Verification Evidence</CardTitle>
                <CardDescription>
                  Artifact checksums, duplicate rate test results, and deterministic proof matrices will render here upon deliverable submission.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="money" className="mt-6 grid gap-4">
          <PaymentPanel payment={payment.data ?? null} />
        </TabsContent>
      </Tabs>

      <Separator className="my-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          {approving ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : null}
          <span>Amounts shown come strictly from the signed agreement: never from client-side state.</span>
        </p>
        <span className="font-mono text-[11px] text-muted-foreground/80">Task ID: {taskId}</span>
      </div>
    </div>
  );
}
