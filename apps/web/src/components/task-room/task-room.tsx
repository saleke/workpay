"use client";

import { useCallback, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
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
import { CasesPanel } from "./cases-panel";
import { ContractReview } from "./contract-review";
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

  // Live updates with a cursor fallback if the stream drops (plan section 4).
  const stream = useEventStream({
    url: `/api/v1/tasks/${taskId}/events`,
    withSince: true,
    onEvent: () => refresh(),
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

  if (room.loading && !room.data) return <LoadingState label="Opening task room..." />;
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
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold md:text-2xl">{task.title}</h1>
            <StatusBadge tone={taskStatusTone(task.status)}>
              {taskStatusLabel(task.status)}
            </StatusBadge>
            {stream.connected ? <span className="text-xs text-muted-foreground">live</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">{task.rawRequest}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Budget</span>
          <span className="font-medium">
            {formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency })}
          </span>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <Tabs defaultValue="outcome" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="outcome">Outcome</TabsTrigger>
          <TabsTrigger value="state">State</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="money">Money</TabsTrigger>
        </TabsList>

        <TabsContent value="outcome" className="mt-4 grid gap-4">
          {needsPlanning ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Understand the request</CardTitle>
                <CardDescription>
                  WorkPay will turn this into a verifiable work specification and a draft contract.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={runPlanning}>
                  <Sparkles className="mr-2 h-4 w-4" /> Run planning
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
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contract</CardTitle>
                <CardDescription>No contract has been drafted yet.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="state" className="mt-4 grid gap-4">
          {canSearchProviders ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Find someone</CardTitle>
                <CardDescription>
                  The contract is approved. WorkPay can now recommend an eligible provider.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={runProviderSearch}>
                  <Search className="mr-2 h-4 w-4" /> Find a provider
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {providerSelection ? <ProviderRecommendation selection={providerSelection} /> : null}
          {execution ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Work</CardTitle>
                <CardDescription>
                  Provider accepted and is working. Latest submission:{" "}
                  {execution.latestSubmission
                    ? `version ${execution.latestSubmission.version}`
                    : "none yet"}
                  .
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          <ActivityTimeline entries={activity.data ?? []} />
        </TabsContent>

        <TabsContent value="evidence" className="mt-4 grid gap-4">
          <CasesPanel cases={cases} />
          {verification.data ? (
            <VerificationView verification={verification.data} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evidence</CardTitle>
                <CardDescription>
                  Artifacts and verification results will appear once work is submitted.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="money" className="mt-4 grid gap-4">
          <PaymentPanel payment={payment.data ?? null} />
        </TabsContent>
      </Tabs>

      <Separator />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Amounts shown come only from the contract and agreement — never from the browser.
      </p>
    </div>
  );
}
