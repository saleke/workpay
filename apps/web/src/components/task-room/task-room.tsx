"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Lock,
  Plus,
  Receipt,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useEventStream } from "@/lib/use-event-stream";
import {
  approveContract,
  getTaskActivity,
  getTaskPayment,
  getTaskRoom,
  getSubmissionVerification,
  modifyContractCriteria,
  simulatePaymentAuthorization,
} from "@/lib/api/endpoints";
import type { ContractDto, TaskRoomDto, VerificationDto } from "@/lib/api/types";
import { TaskConversationsPanel } from "./task-conversations-panel";
import { PaymentPanel } from "./payment-panel";
import { Button } from "@/components/ui/button";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TaskRoom({ taskId }: { taskId: string }) {
  const room = useApi(() => getTaskRoom(taskId), [taskId], `task-room-${taskId}`);
  const activity = useApi(() => getTaskActivity(taskId), [taskId], `task-activity-${taskId}`);
  const payment = useApi(() => getTaskPayment(taskId), [taskId], `task-payment-${taskId}`);

  const submissionId = room.data?.execution?.latestSubmission?.id ?? null;
  const verification = useApi<VerificationDto>(
    () =>
      submissionId
        ? getSubmissionVerification(submissionId)
        : Promise.resolve({ data: null, error: null }),
    [submissionId],
  );

  const [activeTab, setActiveTab] = useState<
    "contract" | "execution" | "verification" | "payment" | "activity"
  >("contract");

  const [signing, setSigning] = useState(false);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [newRequirementText, setNewRequirementText] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [simulatingPayment, setSimulatingPayment] = useState(false);

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

  useEventStream({
    url: `/api/v1/tasks/${taskId}/events`,
    withSince: true,
    onEvent: debouncedRefresh,
  });

  const onSignContract = useCallback(
    async (contract: ContractDto) => {
      setSigning(true);
      setActionError(null);
      const res = await approveContract(contract.id, contract.contractHash, newIdempotencyKey());
      setSigning(false);
      if (res.error) {
        setActionError(
          "This contract changed since you reviewed it. Please review the updated terms.",
        );
        return;
      }
      refresh();
    },
    [refresh],
  );

  const onAddRequirement = async (contractId: string) => {
    if (!newRequirementText.trim()) return;
    setIsModifying(true);
    setActionError(null);
    const res = await modifyContractCriteria(contractId, {
      action: "ADD",
      statement: newRequirementText.trim(),
      acceptanceRelevant: true,
    });
    setIsModifying(false);
    if (res.error) {
      setActionError("Could not add requirement. Please try again.");
      return;
    }
    setNewRequirementText("");
    debouncedRefresh();
  };

  const onDeleteRequirement = async (contractId: string, key: string) => {
    setIsModifying(true);
    setActionError(null);
    const res = await modifyContractCriteria(contractId, {
      action: "DELETE",
      key,
    });
    setIsModifying(false);
    if (res.error) {
      setActionError("Could not remove requirement.");
      return;
    }
    debouncedRefresh();
  };

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(taskId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const beginPaymentSimulation = async () => {
    setSimulatingPayment(true);
    setActionError(null);
    const result = await simulatePaymentAuthorization(taskId, newIdempotencyKey());
    setSimulatingPayment(false);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    setActiveTab("payment");
    refresh();
  };

  if (room.loading && !room.data) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 py-6" role="status" aria-live="polite">
        <span className="sr-only">Opening task workspace…</span>
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--wp-border)]" />
        <div className="workpay-card space-y-4 p-6 sm:p-8">
          <div className="h-4 w-36 animate-pulse rounded bg-[var(--wp-surface-subtle)]" />
          <div className="h-9 w-3/4 animate-pulse rounded bg-[var(--wp-surface-subtle)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--wp-surface-subtle)]" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--wp-surface-subtle)]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="workpay-card h-28 animate-pulse bg-[var(--wp-surface-subtle)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (room.error || !room.data) {
    return (
      <div className="mx-auto max-w-lg py-16 sm:py-24">
        <div className="workpay-card p-6 text-center sm:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-[var(--charcoal)]">
            Task workspace unavailable
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            {room.error?.status === 502
              ? "The task service returned a temporary 502 error. Try refreshing in a moment."
              : "We couldn’t load this task. It may no longer be available to your account."}
          </p>
          {room.error?.status ? (
            <p className="mt-3 font-mono text-xs text-[var(--text-muted)]">
              Request status: {room.error.status}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--wp-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--charcoal)] transition-colors hover:bg-[var(--wp-surface-subtle)]"
            >
              <RotateCw className="h-4 w-4" />
              Try again
            </button>
            <Link
              href="/tasks"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--charcoal)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Return to tasks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { task, activeContract, workSpecification, providerSelection, execution } = room.data;
  const isPaid = task.status === "COMPLETED" || task.status === "PAYMENT_RELEASE";
  const moneyAmount = formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency });

  const isDraftOrAwaiting =
    !activeContract ||
    activeContract.status === "DRAFT" ||
    activeContract.status === "AWAITING_APPROVAL" ||
    task.status === "CONTRACT_REVIEW" ||
    task.status === "PLANNING" ||
    task.status === "CREATED";

  const requirements = activeContract?.requirements ?? workSpecification?.requirements ?? [];
  const verificationResults = verification.data?.results ?? [];
  const resultsByKey = new Map(verificationResults.map((r) => [r.requirementKey, r]));
  const providerName = providerSelection?.provider?.displayName || "Assigned specialist";

  // Derive status presentation
  let statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
  let statusText = "In Execution";

  if (isDraftOrAwaiting) {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Awaiting Sign-off";
  } else if (task.status === "HUMAN_REVIEW") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Review Needed";
  } else if (task.status === "REVISION_REQUIRED") {
    statusBadgeClass = "bg-[var(--wp-danger-subtle)] text-[var(--wp-danger)]";
    statusText = "Revision Requested";
  } else if (task.status === "SUBMITTED" || task.status === "VERIFYING") {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Verifying Proof";
  } else if (task.status === "AGREEMENT_READY") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Ready for Assignment";
  } else if (isPaid) {
    statusBadgeClass = "bg-[var(--wp-success-subtle)] text-[var(--wp-success)]";
    statusText = "Settled";
  }

  const nextStepLabel =
    isDraftOrAwaiting && activeContract
      ? "Review and approve the scope"
      : task.status === "HUMAN_REVIEW"
        ? "Choose an independent reviewer"
        : task.status === "AGREEMENT_READY"
          ? "Validate the next stage"
          : task.status === "WORK_IN_PROGRESS"
            ? "Work is in progress"
            : task.status === "SUBMITTED" || task.status === "VERIFYING"
              ? "Deliverables are being verified"
              : task.status === "REVISION_REQUIRED"
                ? "A revision has been requested"
                : isPaid
                  ? "Task settlement is complete"
                  : "Review task details";

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-16">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/tasks"
          className="text-[var(--text-muted)] transition-colors hover:text-[var(--charcoal)]"
        >
          Tasks
        </Link>
        <span className="mx-2 text-[var(--wp-border-strong)]" aria-hidden="true">
          /
        </span>
        <span className="font-medium text-[var(--charcoal)]">Task workspace</span>
      </nav>

      <header className="workpay-card overflow-hidden">
        <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between lg:p-8">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--wp-accent)]" />
                Task workspace
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}>
                {statusText}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[var(--wp-border)] bg-white px-2.5 font-mono text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--wp-border-strong)] hover:text-[var(--charcoal)]"
                title="Copy task ID"
                aria-label={copiedId ? "Task ID copied" : "Copy task ID"}
              >
                <span>{taskId.slice(0, 12)}</span>
                {copiedId ? (
                  <Check className="h-3.5 w-3.5 text-[var(--green)]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>

            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--charcoal)] sm:text-3xl lg:text-4xl">
                {task.title}
              </h1>
              <div className="mt-4 border-l-2 border-[var(--wp-border-strong)] pl-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Your request
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[var(--wp-text-secondary)]">
                  {task.rawRequest}
                </p>
              </div>
            </div>
          </div>

          <aside className="w-full shrink-0 rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 sm:p-5 lg:max-w-xs">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Next step
            </p>
            <p className="mt-1 text-base font-semibold leading-snug text-[var(--charcoal)]">
              {nextStepLabel}
            </p>
            {isDraftOrAwaiting && activeContract ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Confirm the agreed scope and budget. This does not authorize or capture a payment.
                </p>
                <button
                  type="button"
                  onClick={() => onSignContract(activeContract)}
                  disabled={signing}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--charcoal)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signing ? "Approving…" : "Approve scope and budget"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : task.status === "HUMAN_REVIEW" ? (
              <Link
                href={`/reviewers?taskId=${encodeURIComponent(taskId)}`}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--wp-warning)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95"
              >
                <AlertTriangle className="h-4 w-4" />
                Browse reviewers
              </Link>
            ) : task.status === "AGREEMENT_READY" ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Run the payment-policy simulation to create an assignment. No funds move, and the
                  professional must still accept and start work.
                </p>
                <Button
                  type="button"
                  onClick={() => void beginPaymentSimulation()}
                  disabled={simulatingPayment}
                  className="mt-4 w-full"
                >
                  {simulatingPayment ? "Running payment test…" : "Run payment test & assign"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Your task status and the latest updates are shown below.
              </p>
            )}
            <button
              type="button"
              onClick={refresh}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--wp-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--wp-text-secondary)] transition-colors hover:text-[var(--charcoal)]"
              title="Refresh task status"
            >
              <RotateCw className="h-4 w-4" />
              Refresh status
            </button>
          </aside>
        </div>
      </header>

      <section aria-label="Task lifecycle" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workpay-card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              01 · Commitment
            </p>
            <FileText className="h-4 w-4 shrink-0 text-[var(--wp-text-muted)]" />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-[var(--charcoal)]">
            {activeContract ? `Contract v${activeContract.version}` : "Drafting terms"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {activeContract?.status === "ACTIVE" ? "Terms agreed and locked" : "Awaiting sign-off"}
          </p>
        </div>

        <div className="workpay-card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              02 · Execution
            </p>
            <Users className="h-4 w-4 shrink-0 text-[var(--wp-text-muted)]" />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-[var(--charcoal)]">
            {providerName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {execution?.status === "COMPLETED"
              ? "Deliverable Received"
              : task.status === "REVISION_REQUIRED"
                ? "Revising Deliverable"
                : task.status === "WORK_IN_PROGRESS"
                  ? "In Progress"
                  : task.status === "AGREEMENT_READY"
                    ? "Awaiting payment test"
                    : isDraftOrAwaiting
                      ? "Pending Sign-off"
                      : "Assigned"}
          </p>
        </div>

        <div className="workpay-card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              03 · Verification
            </p>
            <CheckSquare className="h-4 w-4 shrink-0 text-[var(--wp-text-muted)]" />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-[var(--charcoal)]">
            {task.status === "HUMAN_REVIEW"
              ? "Human Review Needed"
              : verification.data?.outcome === "PASS"
                ? "Passed (100% Proof)"
                : verification.data?.outcome === "FAIL"
                  ? "Failed (Revision Required)"
                  : "Awaiting Deliverable"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {requirements.length} acceptance criteria
          </p>
        </div>

        <div className="workpay-card min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              04 · Settlement
            </p>
            <Receipt className="h-4 w-4 shrink-0 text-[var(--wp-text-muted)]" />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-[var(--charcoal)]">
            {payment.data?.status === "CAPTURED" || isPaid
              ? "Simulated capture recorded"
              : payment.data?.status === "AUTHORIZED"
                ? "Simulated authorization active"
                : payment.data?.status === "UNKNOWN"
                  ? "Authorization status unknown"
                  : payment.data?.status === "FAILED"
                    ? "Authorization failed"
                    : "Not authorized"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {payment.data ? `${moneyAmount} policy test` : "No payment simulation started"}
          </p>
        </div>
      </section>

      {actionError && (
        <div
          className="rounded-xl border border-[var(--wp-danger)]/25 bg-[var(--wp-danger-subtle)] p-3.5 text-sm text-[var(--wp-danger)]"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <TaskConversationsPanel
        taskId={taskId}
        buyerUserId={task.userId}
        contract={activeContract}
        selection={providerSelection}
        onSelectionChanged={() => room.reload()}
        onTaskChanged={refresh}
      />

      <Link
        href={`/reviewers?taskId=${encodeURIComponent(taskId)}`}
        className="group workpay-card flex flex-col gap-2 p-4 transition-colors hover:border-[var(--border-strong)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--charcoal)]">
            Find an independent reviewer
          </span>
          <span className="mt-1 block text-sm text-[var(--text-muted)]">
            Compare domain fit and reviewer-supplied evidence. You choose whether to contact anyone.
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-[var(--charcoal)] transition-transform group-hover:translate-x-0.5">
          Explore reviewers →
        </span>
      </Link>

      {/* Workspace sections */}
      <nav
        aria-label="Task workspace sections"
        className="-mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-1.5 text-xs font-medium sm:mx-0 sm:gap-1.5 sm:p-2 sm:text-sm"
      >
        <button
          type="button"
          aria-pressed={activeTab === "contract"}
          onClick={() => setActiveTab("contract")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "contract"
              ? "border border-[var(--wp-border)] bg-white font-semibold text-[var(--charcoal)] shadow-sm"
              : "border border-transparent text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--charcoal)]"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Specification & Contract</span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "execution"}
          onClick={() => setActiveTab("execution")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "execution"
              ? "border border-[var(--wp-border)] bg-white font-semibold text-[var(--charcoal)] shadow-sm"
              : "border border-transparent text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--charcoal)]"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Execution & Provider</span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "verification"}
          onClick={() => setActiveTab("verification")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "verification"
              ? "border border-[var(--wp-border)] bg-white font-semibold text-[var(--charcoal)] shadow-sm"
              : "border border-transparent text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--charcoal)]"
          }`}
        >
          <CheckSquare className="h-4 w-4" />
          <span>Deliverables & Verification</span>
          {task.status === "HUMAN_REVIEW" && (
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "payment"}
          onClick={() => setActiveTab("payment")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "payment"
              ? "border border-[var(--wp-border)] bg-white font-semibold text-[var(--charcoal)] shadow-sm"
              : "border border-transparent text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--charcoal)]"
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>PayPal Settlement Ledger</span>
        </button>

        <button
          type="button"
          aria-pressed={activeTab === "activity"}
          onClick={() => setActiveTab("activity")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "activity"
              ? "border border-[var(--wp-border)] bg-white font-semibold text-[var(--charcoal)] shadow-sm"
              : "border border-transparent text-[var(--text-muted)] hover:bg-white/70 hover:text-[var(--charcoal)]"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Activity & Audit</span>
        </button>
      </nav>

      {/* 4. Tab 1: Specification & Contract (Section 7) */}
      {activeTab === "contract" && (
        <div className="space-y-6">
          <div className="workpay-card p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  Contract Draft v{activeContract?.version ?? 1}
                </span>
                <h2 className="text-lg font-semibold text-[var(--charcoal)] mt-0.5">
                  Scope and Acceptance Criteria
                </h2>
              </div>

              {isDraftOrAwaiting && activeContract && (
                <button
                  type="button"
                  onClick={() => setEditingRequirements(!editingRequirements)}
                  className="text-xs font-medium text-[var(--text-soft)] hover:text-[var(--charcoal)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
                >
                  {editingRequirements ? "Done editing" : "Add / remove criteria"}
                </button>
              )}
            </div>

            <div>
              <p className="text-xs text-[var(--text-muted)] font-medium mb-3">
                Payment is captured via PayPal only when every observable criterion below is
                cryptographically proven:
              </p>

              <div className="space-y-2.5">
                {requirements.map((req, idx) => (
                  <div
                    key={req.key || idx}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] flex items-start justify-between gap-4 text-xs sm:text-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-[var(--text-muted)] mt-0.5">
                        {idx + 1}.
                      </span>
                      <span className="text-[var(--charcoal)] font-medium leading-relaxed">
                        {req.statement}
                      </span>
                    </div>

                    {editingRequirements && activeContract && (
                      <button
                        type="button"
                        onClick={() => onDeleteRequirement(activeContract.id, req.key)}
                        disabled={isModifying}
                        className="text-red-600 hover:text-red-800 p-1 rounded transition-colors shrink-0"
                        title="Remove criterion"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {editingRequirements && activeContract && (
                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={newRequirementText}
                    onChange={(e) => setNewRequirementText(e.target.value)}
                    placeholder="Add an observable acceptance check..."
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-white text-xs sm:text-sm text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--charcoal)]"
                  />
                  <button
                    type="button"
                    onClick={() => onAddRequirement(activeContract.id)}
                    disabled={isModifying || !newRequirementText.trim()}
                    className="bg-[var(--charcoal)] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Add Check
                  </button>
                </div>
              )}
            </div>

            {/* Authority Boundaries (Section 7) */}
            <div className="pt-4 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                <div className="font-semibold text-emerald-900 flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>WorkPay Authority Boundaries</span>
                </div>
                <p className="text-emerald-800 leading-relaxed">
                  WorkPay will not choose or contact a professional on your behalf. You approve each
                  exact contact request. Approving these terms does not authorize or capture a
                  payment.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100">
                <div className="font-semibold text-rose-900 flex items-center gap-1.5 mb-1.5">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Restricted Actions</span>
                </div>
                <p className="text-rose-800 leading-relaxed">
                  WorkPay cannot change these approved criteria without consent or authorize or
                  capture funds during this terms-approval step.
                </p>
              </div>
            </div>

            {/* Sign & Commit Action */}
            {isDraftOrAwaiting && activeContract && (
              <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-[var(--text-muted)]">
                  Approving records the current work scope and budget. No payment is authorized or
                  captured at this step.
                </div>

                <button
                  type="button"
                  onClick={() => onSignContract(activeContract)}
                  disabled={signing}
                  className="bg-[var(--charcoal)] text-white hover:bg-black px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm self-start sm:self-auto"
                >
                  {signing ? "Approving terms..." : "Approve scope and budget"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Execution & Provider (Section 8) */}
      {activeTab === "execution" && (
        <div className="space-y-6">
          <div className="workpay-card p-6 space-y-6">
            <h2 className="text-lg font-semibold text-[var(--charcoal)]">
              Assigned Specialist & Milestone Execution
            </h2>

            {providerSelection?.provider ? (
              <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-base text-[var(--charcoal)]">
                    {providerSelection.provider.displayName}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Match Confidence 98%
                  </span>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {providerSelection.reason ||
                    "Selected based on demonstrated domain accuracy, verified tooling, and high acceptance rate on comparable dataset transformations."}
                </p>

                <div className="pt-2 flex items-center gap-6 text-xs text-[var(--text-soft)]">
                  <span>
                    <strong>{providerSelection.provider.firstPassAcceptancePct ?? 98}%</strong>{" "}
                    first-pass pass rate
                  </span>
                  <span>
                    <strong>100%</strong> policy compliance
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">
                Provider discovery is in progress. Specialist matching occurs upon contract
                sign-off.
              </div>
            )}

            {/* Execution Milestones */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Lifecycle Milestones
              </h3>

              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  <span className="font-medium text-[var(--charcoal)]">
                    1. Intent Synthesized & Criteria Structured
                  </span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  {isDraftOrAwaiting ? (
                    <Clock className="h-4 w-4 text-[var(--amber)] shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  )}
                  <span className="font-medium text-[var(--charcoal)]">
                    2. Professional Chosen &amp; Terms Agreed
                  </span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  {task.status === "WORK_IN_PROGRESS" ||
                  task.status === "SUBMITTED" ||
                  task.status === "VERIFYING" ||
                  isPaid ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="font-medium text-[var(--charcoal)]">
                    3. Deliverables Produced & Submitted
                  </span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  {isPaid ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="font-medium text-[var(--charcoal)]">
                    4. Evidence & Acceptance
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Deliverables & Verification Proofs (Section 11) */}
      {activeTab === "verification" && (
        <div className="space-y-6">
          <div className="workpay-card p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--charcoal)]">
                Deliverables & Requirement-by-Requirement Proofs
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Each individual acceptance criterion is evaluated against cryptographic evidence and
                verifiable tests.
              </p>
            </div>

            {/* Criteria Results */}
            <div className="space-y-3">
              {requirements.map((req, idx) => {
                const result = resultsByKey.get(req.key);
                let badgeClass = "bg-gray-100 text-gray-700";
                let badgeText = "Pending Submission";
                let icon = <Clock className="h-3.5 w-3.5" />;

                if (result) {
                  if (result.outcome === "PASS") {
                    badgeClass = "bg-emerald-100 text-emerald-800";
                    badgeText = "Passed Proof";
                    icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
                  } else if (result.outcome === "FAIL") {
                    badgeClass = "bg-rose-100 text-rose-800";
                    badgeText = "Failed Verification";
                    icon = <XCircle className="h-3.5 w-3.5 text-rose-600" />;
                  } else if (result.outcome === "UNCERTAIN") {
                    badgeClass = "bg-amber-100 text-amber-800";
                    badgeText = "Uncertain - Review Needed";
                    icon = <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
                  }
                } else if (isPaid) {
                  badgeClass = "bg-emerald-100 text-emerald-800";
                  badgeText = "Passed Proof";
                  icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
                }

                return (
                  <div
                    key={req.key || idx}
                    className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <span className="font-mono text-xs text-[var(--text-muted)] mt-0.5">
                          {idx + 1}.
                        </span>
                        <span className="text-xs sm:text-sm font-semibold text-[var(--charcoal)]">
                          {req.statement}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 self-start sm:self-auto ${badgeClass}`}
                      >
                        {icon}
                        <span>{badgeText}</span>
                      </span>
                    </div>

                    {result && result.explanation && (
                      <div className="pl-6 pt-1 text-xs text-[var(--text-soft)] bg-white/60 p-2.5 rounded-lg border border-[var(--border-subtle)]">
                        <div className="font-medium text-[var(--charcoal)]">Evidence:</div>
                        <p className="mt-0.5">{result.explanation}</p>
                        {result.actual && (
                          <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                            Observed: {result.actual}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Human Review Decision Surface (Section 11) */}
            {task.status === "HUMAN_REVIEW" && (
              <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/40 space-y-3">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>Independent review needed</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Automated checks and AI cannot determine whether this work is professionally
                  satisfactory. WorkPay does not provide an arbitrator or judge this result. Use the
                  agreed review criteria and contact an independent reviewer. Any PayPal
                  authorization remains subject to its actual status; this screen does not promise
                  that funds are held.
                </p>
                <Link
                  href={`/reviewers?taskId=${encodeURIComponent(taskId)}`}
                  className="inline-flex rounded-lg bg-amber-700 px-4 py-2 text-xs font-medium text-white hover:bg-amber-800"
                >
                  Find an independent reviewer
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Tab 4: PayPal Settlement Ledger (The Physical Voucher Ticket Card) */}
      {activeTab === "payment" && <PaymentPanel payment={payment.data ?? null} />}

      {/* Legacy payment receipt retained temporarily for migration reference. */}
      {false && activeTab === "payment" && (
        <div className="space-y-6">
          <div className="receipt-ticket">
            {/* Upper Voucher Section */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  PAYMENT-RECORD-{taskId.slice(0, 8).toUpperCase()}
                </span>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {isPaid ? "Captured on Verified Proof" : "Held in PayPal Authorization Hold"}
                </span>
              </div>

              <h2 className="text-xl font-bold tracking-tight text-[var(--charcoal)] mt-3">
                {task.title}
              </h2>

              <div className="mt-4 flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Authorized Settlement Amount
                  </div>
                  <div className="text-3xl font-bold tracking-tight text-[var(--charcoal)]">
                    {moneyAmount}{" "}
                    <span className="text-xs font-normal text-[var(--text-muted)]">
                      {task.currency}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Specialist Payout Destination
                  </div>
                  <div className="text-sm font-semibold text-[var(--charcoal)]">
                    {payment.data?.payoutEmail ||
                      providerSelection?.provider?.displayName ||
                      "Assigned specialist"}
                  </div>
                </div>
              </div>
            </div>

            {/* Perforated Divider (Notches + Dashed Line) */}
            <div className="receipt-divider">
              <div className="receipt-notch-left" />
              <div className="receipt-line" />
              <div className="receipt-notch-right" />
            </div>

            {/* Lower Voucher Section */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[var(--text-muted)] block">PayPal Authorization ID:</span>
                  <span className="font-mono font-medium text-[var(--charcoal)] block mt-0.5">
                    {payment.data?.paypalAuthorizationId || "AUTH-PAYPAL-HOLD-001"}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block">Settlement Rail:</span>
                  <span className="font-medium text-[var(--charcoal)] block mt-0.5">
                    PayPal Authorization Hold (Non-Custodial)
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block">Contract Hash:</span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)] truncate block mt-0.5">
                    {activeContract?.contractHash || "sha256:4a8f9b2c..."}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block">Proof Verification Status:</span>
                  <span className="font-medium text-[var(--green)] block mt-0.5">
                    {isPaid ? "100% Cryptographic Criteria Met" : "Verification In Progress"}
                  </span>
                </div>
              </div>

              <div className="pt-2 text-xs text-[var(--text-muted)] leading-relaxed border-t border-[var(--border-subtle)]">
                * Note on custody: WorkPay does not operate a wallet or store funds. Payments are
                secured via external PayPal authorization holds and captured only upon verified
                proof completion.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Tab 5: Activity & Audit Timeline (Section 13) */}
      {activeTab === "activity" && (
        <div className="workpay-card divide-y divide-[var(--border-subtle)]">
          {activity.data && activity.data.length > 0 ? (
            activity.data.map((entry) => {
              const timeStr = new Date(entry.occurredAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <div
                  key={entry.id}
                  className="p-4 flex items-baseline justify-between gap-4 text-xs sm:text-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="h-2 w-2 rounded-full bg-[var(--amber)] shrink-0 mt-2" />
                    <div>
                      <span className="font-semibold text-[var(--charcoal)]">{entry.title}</span>
                      {entry.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-xs text-[var(--text-muted)] font-mono shrink-0">
                    {timeStr}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No activity entries recorded for this task yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
