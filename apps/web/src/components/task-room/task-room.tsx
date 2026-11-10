"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  FileText,
  History,
  Lock,
  Receipt,
  RotateCw,
  Trash2,
  Users,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useEventStream } from "@/lib/use-event-stream";
import {
  approveContract,
  createPayPalPaymentOrder,
  getPayPalAccountStatus,
  getTaskActivity,
  getTaskPayment,
  getTaskRoom,
  modifyContractCriteria,
  releaseTaskPayment,
  simulatePaymentAuthorization,
} from "@/lib/api/endpoints";
import type { ContractDto, TaskRoomDto } from "@/lib/api/types";
import { TaskConversationsPanel } from "./task-conversations-panel";
import { PaymentPanel } from "./payment-panel";
import { HumanReviewWorkspace } from "./human-review-workspace";
import { CasesPanel } from "./cases-panel";
import { Button } from "@/components/ui/button";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TaskRoom({ taskId }: { taskId: string }) {
  const room = useApi(() => getTaskRoom(taskId), [taskId], `task-room-${taskId}`);
  const activity = useApi(() => getTaskActivity(taskId), [taskId], `task-activity-${taskId}`);
  const payment = useApi(() => getTaskPayment(taskId), [taskId], `task-payment-${taskId}`);
  const paypal = useApi(() => getPayPalAccountStatus(), [], "paypal-account-status");

  const [activeTab, setActiveTab] = useState<
    "contract" | "execution" | "verification" | "payment" | "activity" | null
  >(null);
  const [conversationLifecycle, setConversationLifecycle] = useState({
    taskId,
    pending: 0,
    open: 0,
    declined: 0,
    withdrawn: 0,
  });
  const updateConversationLifecycle = useCallback(
    (summary: { pending: number; open: number; declined: number; withdrawn: number }) => {
      setConversationLifecycle({ taskId, ...summary });
    },
    [taskId],
  );
  const lifecycle =
    conversationLifecycle.taskId === taskId
      ? conversationLifecycle
      : { taskId, pending: 0, open: 0, declined: 0, withdrawn: 0 };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "execution") setActiveTab("execution");
    if (params.get("section") === "review") setActiveTab("verification");
  }, [taskId]);

  const [signing, setSigning] = useState(false);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [newRequirementText, setNewRequirementText] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [simulatingPayment, setSimulatingPayment] = useState(false);
  const [releasingPayment, setReleasingPayment] = useState(false);
  const [paymentReleaseConfirmed, setPaymentReleaseConfirmed] = useState(false);

  const refresh = useCallback(() => {
    room.reload();
    activity.reload();
    payment.reload();
  }, [room, activity, payment]);

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

  const beginPaymentAuthorization = async () => {
    setSimulatingPayment(true);
    setActionError(null);
    const isEvaluator = paypal.data?.accountClass === "DEMO_FIXTURE";
    if (!isEvaluator) {
      if (!paypal.data?.configured) {
        setSimulatingPayment(false);
        setActionError("PayPal Sandbox is not configured for authenticated member accounts.");
        return;
      }
      if (paypal.data.identity?.status !== "LINKED" || !paypal.data.identity.accountVerified) {
        setSimulatingPayment(false);
        setActionError("Link and verify your PayPal account in Settings before approving payment.");
        return;
      }
    }
    const result = isEvaluator
      ? await simulatePaymentAuthorization(taskId, newIdempotencyKey())
      : await createPayPalPaymentOrder(taskId, newIdempotencyKey());
    setSimulatingPayment(false);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }
    if (!isEvaluator && result.data && "approvalUrl" in result.data) {
      window.location.href = result.data.approvalUrl;
      return;
    }
    setActiveTab("payment");
    refresh();
  };

  const releasePayment = async () => {
    if (!payment.data || !paymentReleaseConfirmed) return;
    setReleasingPayment(true);
    setActionError(null);
    const result = await releaseTaskPayment(
      taskId,
      {
        expectedPaymentId: payment.data.id,
        expectedAmountMinor: payment.data.amountMinor,
        expectedCurrency: payment.data.currency as "USD",
        confirm: true,
      },
      newIdempotencyKey(),
    );
    setReleasingPayment(false);
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
  const currentTab = activeTab ?? (activeContract?.status === "ACTIVE" ? "execution" : "contract");
  const isPaymentCaptured = payment.data?.status === "CAPTURED";
  const moneyAmount = formatMinorMoney({
    amountMinor: activeContract?.budgetMinor ?? task.budgetMinor,
    currency: activeContract?.currency ?? task.currency,
  });

  const isDraftOrAwaiting =
    task.status === "DRAFT" ||
    task.status === "CREATED" ||
    task.status === "PLANNING" ||
    task.status === "AWAITING_CLARIFICATION" ||
    task.status === "CONTRACT_REVIEW" ||
    activeContract?.status === "DRAFT" ||
    activeContract?.status === "AWAITING_APPROVAL";

  const requirements = activeContract?.requirements ?? workSpecification?.requirements ?? [];
  const profileCount = new Set(
    [
      ...(providerSelection?.provider ? [providerSelection.provider] : []),
      ...(providerSelection?.alternatives ?? []),
    ]
      .filter((profile) => profile.eligible !== false)
      .map((profile) => profile.providerId),
  ).size;

  // Derive status presentation
  let statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
  let statusText = "In progress";

  if (isDraftOrAwaiting) {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Scope needs approval";
  } else if (task.status === "AWAITING_CLIENT_REVIEW") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Awaiting client review";
  } else if (task.status === "REVIEW_REQUESTED") {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Review package requested";
  } else if (task.status === "AWAITING_EXTERNAL_REVIEW") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Awaiting independent review";
  } else if (task.status === "REVIEW_ACCEPTED") {
    statusBadgeClass = "bg-[var(--wp-success-subtle)] text-[var(--wp-success)]";
    statusText = "Review accepted";
  } else if (task.status === "HUMAN_REVIEW") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Review needed";
  } else if (task.status === "REVISION_REQUIRED" || task.status === "REJECTED") {
    statusBadgeClass = "bg-[var(--wp-danger-subtle)] text-[var(--wp-danger)]";
    statusText = task.status === "REJECTED" ? "Delivery rejected" : "Revision requested";
  } else if (task.status === "SUBMITTED" || task.status === "VERIFYING") {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Ready to open review";
  } else if (
    (task.status === "PROVIDER_SEARCH" || task.status === "NEGOTIATION") &&
    lifecycle.pending > 0
  ) {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = `Awaiting ${lifecycle.pending} professional response${lifecycle.pending === 1 ? "" : "s"}`;
  } else if (
    (task.status === "PROVIDER_SEARCH" || task.status === "NEGOTIATION") &&
    lifecycle.open > 0
  ) {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Discussion open · not committed";
  } else if (task.status === "AGREEMENT_READY") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Ready for simulated authorization";
  } else if (task.status === "PROVIDER_SEARCH") {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Finding professionals";
  } else if (task.status === "NEGOTIATION") {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Contact in progress";
  } else if (task.status === "PAYMENT_AUTHORIZATION") {
    statusBadgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    statusText = "Simulated authorization in progress";
  } else if (task.status === "COMPLETED") {
    statusBadgeClass = "bg-[var(--wp-success-subtle)] text-[var(--wp-success)]";
    statusText = "Task complete";
  } else if (task.status === "PAYMENT_RELEASE") {
    statusBadgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    statusText = "Simulated release policy";
  } else if (task.status === "CANCELLED" || task.status === "EXPIRED") {
    statusBadgeClass = "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-muted)]";
    statusText = task.status === "CANCELLED" ? "Task cancelled" : "Task expired";
  } else if (task.status === "DISPUTED") {
    statusBadgeClass = "bg-[var(--wp-danger-subtle)] text-[var(--wp-danger)]";
    statusText = "Task disputed";
  }

  const nextStepLabel =
    isDraftOrAwaiting && activeContract
      ? "Review and approve the scope"
      : task.status === "AWAITING_CLIENT_REVIEW"
        ? "Review the live delivery package and decide whether to accept it"
        : task.status === "REVIEW_REQUESTED"
          ? "The professional is preparing the requested review package"
          : task.status === "AWAITING_EXTERNAL_REVIEW"
            ? "Await the agreed independent report, then record the buyer decision"
            : task.status === "REVIEW_ACCEPTED"
              ? "The delivery has been accepted; run the separate simulated release policy"
              : task.status === "HUMAN_REVIEW"
                ? "Open a review or involve an agreed paid reviewer"
                : task.status === "REVISION_REQUIRED" || task.status === "REJECTED"
                  ? "Review the requested revision or rejection"
                  : task.status === "SUBMITTED" || task.status === "VERIFYING"
                    ? "Open a review for the current work"
                    : task.status === "PAYMENT_RELEASE"
                      ? "Review simulated release status"
                      : task.status === "COMPLETED"
                        ? "Task is complete"
                        : task.status === "CANCELLED"
                          ? "Task cancelled"
                          : task.status === "EXPIRED"
                            ? "Task expired"
                            : !execution && lifecycle.pending > 0
                              ? `Waiting for ${lifecycle.pending} professional response${lifecycle.pending === 1 ? "" : "s"}`
                              : !execution && lifecycle.open > 0
                                ? "Continue the discussion; work is not committed"
                                : execution?.status === "ASSIGNED"
                                  ? "Review the assignment and accept to begin"
                                  : execution?.status === "ACCEPTED" ||
                                      execution?.status === "IN_PROGRESS"
                                    ? "Work is in progress"
                                    : task.status === "AGREEMENT_READY"
                                      ? "Run simulated authorization and assign work"
                                      : task.status === "PROVIDER_SEARCH"
                                        ? profileCount > 0
                                          ? "Choose a professional to contact"
                                          : "Finding available professionals"
                                        : task.status === "NEGOTIATION"
                                          ? "Continue your contact discussion"
                                          : "Review task details";

  const workspaceSections = [
    {
      id: "contract" as const,
      icon: FileText,
      title: "Scope & agreement",
      status: activeContract ? `Version ${activeContract.version}` : "Scope in preparation",
    },
    {
      id: "execution" as const,
      icon: Users,
      title: "Professional",
      status:
        lifecycle.pending > 0
          ? `${lifecycle.pending} awaiting response`
          : lifecycle.open > 0
            ? `${lifecycle.open} non-binding discussion${lifecycle.open === 1 ? "" : "s"}`
            : profileCount > 0
              ? `${profileCount} available`
              : "No profiles yet",
    },
    {
      id: "verification" as const,
      icon: ClipboardCheck,
      title: "Progress & review",
      status:
        execution?.status === "ASSIGNED"
          ? "Awaiting professional acceptance"
          : execution?.status === "ACCEPTED"
            ? "Accepted · ready to start"
            : execution?.status === "IN_PROGRESS"
              ? "Work in progress · client can open review"
              : execution?.status === "REVIEW_REQUESTED"
                ? "Review package requested"
                : execution?.status === "UNDER_REVIEW"
                  ? "Review open"
                  : task.status === "REVIEW_ACCEPTED"
                    ? "Final work accepted"
                    : task.status === "HUMAN_REVIEW" || task.status === "AWAITING_EXTERNAL_REVIEW"
                      ? "Paid reviewer involved"
                      : `${requirements.length} agreement constraint${requirements.length === 1 ? "" : "s"}`,
    },
    {
      id: "payment" as const,
      icon: Receipt,
      title: "Payment",
      status: payment.loading
        ? "Loading"
        : isPaymentCaptured
          ? "Captured"
          : payment.data
            ? payment.data.status.replaceAll("_", " ").toLowerCase()
            : "Not started",
    },
    {
      id: "activity" as const,
      icon: History,
      title: "Activity",
      status: activity.loading
        ? "Loading"
        : activity.data?.length === 1
          ? "1 update"
          : activity.data?.length
            ? `${activity.data.length} updates`
            : "No updates yet",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-16">
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
        <div className="space-y-6 p-5 sm:p-7 lg:p-8">
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

          <aside className="w-full rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 sm:p-5">
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
                  className="mt-4 inline-flex min-h-11 w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[var(--charcoal)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signing ? "Approving…" : "Approve scope and budget"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : task.status === "HUMAN_REVIEW" ? (
              <Link
                href={`/reviewers?taskId=${encodeURIComponent(taskId)}`}
                className="mt-4 inline-flex min-h-11 w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[var(--wp-warning)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-95"
              >
                <AlertTriangle className="h-4 w-4" />
                Browse reviewers
              </Link>
            ) : !execution && (lifecycle.pending > 0 || lifecycle.open > 0) ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {lifecycle.pending > 0
                    ? "Your contact request is waiting for a response. Keep watching the conversation for the next step."
                    : "A professional accepted the discussion. Work starts only after the exact terms and assignment are accepted by both parties."}
                </p>
                <label className="mt-4 flex max-w-md cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--wp-border)] bg-white p-3 text-xs leading-5 text-[var(--wp-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={paymentReleaseConfirmed}
                    onChange={(event) => setPaymentReleaseConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  <span>
                    I approve release of {payment.data ? formatMinorMoney(payment.data) : "the authorized amount"}
                    {payment.data?.mode === "FAKE" ? " in evaluator simulation" : " through PayPal"}.
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("execution")}
                  className="mt-4 w-full max-w-md"
                >
                  {lifecycle.pending > 0 ? "View contact requests" : "Open discussion"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            ) : !execution &&
              profileCount > 0 &&
              (task.status === "PROVIDER_SEARCH" || task.status === "NEGOTIATION") ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Compare profiles and choose a professional to contact. The approved scope remains
                  unchanged.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("execution")}
                  className="mt-4 w-full max-w-md"
                >
                  Review profiles
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            ) : task.status === "AGREEMENT_READY" ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {paypal.data?.accountClass === "DEMO_FIXTURE"
                    ? "This evaluator task uses deterministic simulated authorization; no funds move."
                    : "Approve this PayPal order to authorize the agreed amount directly for the onboarded professional."}
                </p>
                <Button
                  type="button"
                  onClick={() => void beginPaymentAuthorization()}
                  disabled={simulatingPayment}
                  className="mt-4 w-full max-w-md"
                >
                  {simulatingPayment
                    ? "Preparing authorization…"
                    : paypal.data?.accountClass === "DEMO_FIXTURE"
                      ? "Simulate authorization and assign work"
                      : "Continue to PayPal approval"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            ) : task.status === "WORK_IN_PROGRESS" ||
              task.status === "REVIEW_REQUESTED" ||
              task.status === "SUBMITTED" ||
              task.status === "VERIFYING" ||
              task.status === "AWAITING_CLIENT_REVIEW" ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Open a progress checkpoint or final review at any useful moment. Add notes, live
                  links, or files that help explain the work.
                </p>
                <Button
                  type="button"
                  onClick={() => setActiveTab("verification")}
                  className="mt-4 w-full max-w-md"
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Open review workspace
                </Button>
              </>
            ) : task.status === "REVIEW_ACCEPTED" || task.status === "PAYMENT_RELEASE" ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {payment.data?.mode === "FAKE"
                    ? "The buyer accepted this delivery. Run the simulated release policy; no funds will be charged or paid."
                    : "The buyer accepted this delivery. Recheck policy and capture the authorized PayPal amount directly to the onboarded professional."}
                </p>
                <Button
                  type="button"
                  onClick={() => void releasePayment()}
                  disabled={releasingPayment || !paymentReleaseConfirmed}
                  className="mt-4 w-full max-w-md"
                >
                  {releasingPayment
                    ? "Running release policy…"
                    : payment.data?.mode === "FAKE"
                      ? "Approve simulated release"
                      : "Approve and release PayPal payment"}
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
              className="mt-3 inline-flex min-h-10 w-full max-w-md items-center justify-center gap-2 rounded-xl border border-[var(--wp-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--wp-text-secondary)] transition-colors hover:text-[var(--charcoal)]"
              title="Refresh task status"
            >
              <RotateCw className="h-4 w-4" />
              Refresh status
            </button>
          </aside>
        </div>
      </header>

      {actionError && (
        <div
          className="rounded-xl border border-[var(--wp-danger)]/25 bg-[var(--wp-danger-subtle)] p-3.5 text-sm text-[var(--wp-danger)]"
          role="alert"
        >
          {actionError}
        </div>
      )}
      <CasesPanel cases={room.data.cases} />

      <section aria-labelledby="task-details-heading" className="space-y-4">
        <div>
          <h2
            id="task-details-heading"
            className="text-lg font-semibold tracking-tight text-[var(--charcoal)]"
          >
            Task details
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Review the agreed scope, work, payment status, and task history.
          </p>
        </div>

        <div className="space-y-4">
          <nav
            aria-label="Task workspace sections"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
          >
            {workspaceSections.map((section) => {
              const Icon = section.icon;
              const isActive = currentTab === section.id;

              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={isActive}
                  aria-controls="task-section-content"
                  onClick={() => setActiveTab(section.id)}
                  aria-label={`${section.title}. ${section.status}`}
                  className={`flex min-w-[160px] shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "border-[var(--wp-border)] bg-white text-[var(--charcoal)] shadow-sm"
                      : "border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[var(--text-muted)] hover:bg-white"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isActive
                        ? "bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                        : "bg-white text-[var(--wp-text-muted)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-sm font-semibold">
                      {section.title}
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-[var(--wp-text-secondary)]">
                      {section.status}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div
            id="task-section-content"
            className="min-w-0 space-y-4"
            role="region"
            aria-label="Selected task section"
          >
            {/* Scope and agreement */}
            {currentTab === "contract" && (
              <div className="space-y-6">
                <div className="workpay-card p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--text-muted)]">
                        {activeContract
                          ? `Agreement · version ${activeContract.version}`
                          : "Agreement draft"}
                      </span>
                      <h2 className="text-lg font-semibold text-[var(--charcoal)] mt-0.5">
                        Scope and agreed checks
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeContract ? (
                        <span className="rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                          {activeContract.status === "ACTIVE"
                            ? "Approved"
                            : activeContract.status.replaceAll("_", " ").toLowerCase()}
                        </span>
                      ) : null}
                      {isDraftOrAwaiting && activeContract && (
                        <button
                          type="button"
                          onClick={() => setEditingRequirements(!editingRequirements)}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-soft)] transition-colors hover:text-[var(--charcoal)]"
                        >
                          {editingRequirements ? "Done editing" : "Edit checks"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    {activeContract?.summary ? (
                      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-[var(--wp-text-secondary)]">
                        {activeContract.summary}
                      </p>
                    ) : null}
                    {activeContract ? (
                      <dl className="mb-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-3.5">
                          <dt className="text-xs font-medium text-[var(--text-muted)]">
                            Buyer budget ceiling
                          </dt>
                          <dd className="mt-1 text-base font-semibold text-[var(--charcoal)]">
                            {formatMinorMoney({
                              amountMinor: activeContract.budgetMinor,
                              currency: activeContract.currency,
                            })}
                          </dd>
                          <dd className="mt-1 text-xs text-[var(--text-muted)]">
                            Approved maximum; not yet a professional-accepted price.
                          </dd>
                        </div>
                        <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-3.5">
                          <dt className="text-xs font-medium text-[var(--text-muted)]">
                            Target delivery
                          </dt>
                          <dd className="mt-1 text-base font-semibold text-[var(--charcoal)]">
                            {activeContract.deadline
                              ? new Date(activeContract.deadline).toLocaleDateString(undefined, {
                                  dateStyle: "medium",
                                })
                              : "Not specified"}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                    <p className="mb-3 text-sm text-[var(--text-muted)]">
                      The following checks describe how the work will be reviewed:
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

                  <div className="flex items-start gap-3 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 text-sm">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--wp-text-muted)]" />
                    <p className="leading-relaxed text-[var(--wp-text-secondary)]">
                      You decide whom to contact and approve the exact message. Approving this scope
                      does not authorize or move money.
                    </p>
                  </div>

                  {/* Sign & Commit Action */}
                  {isDraftOrAwaiting && activeContract && (
                    <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-xs text-[var(--text-muted)]">
                        Approving records the current work scope and budget. No payment is
                        authorized or captured at this step.
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

            {/* Professional selection and conversations */}
            <div hidden={currentTab !== "execution"}>
              <TaskConversationsPanel
                taskId={taskId}
                contract={activeContract}
                selection={providerSelection}
                onSelectionChanged={() => room.reload()}
                onLifecycleChange={updateConversationLifecycle}
              />
            </div>

            {/* Progress and review */}
            {currentTab === "verification" && (
              <div className="space-y-6">
                {execution ? (
                  <HumanReviewWorkspace
                    taskId={taskId}
                    taskStatus={task.status}
                    execution={execution}
                    requirements={requirements}
                    onChanged={refresh}
                  />
                ) : (
                  <div className="workpay-card p-6 text-sm leading-6 text-[var(--text-muted)]">
                    Review becomes available after a professional is confirmed, payment is
                    authorized, and work starts.
                  </div>
                )}
              </div>
            )}

            {/* Payment status and authorization details */}
            {currentTab === "payment" && (
              <div className="space-y-3">
                <PaymentPanel payment={payment.data ?? null} />
                {!payment.loading && !payment.data ? (
                  <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4">
                    <p className="text-sm font-semibold text-[var(--charcoal)]">
                      What happens next?
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      {task.status === "AGREEMENT_READY"
                        ? "The agreed terms are ready for simulated authorization and assignment. No funds are held or moved."
                        : "Payment activity follows an agreed work arrangement. Contact and discussion alone do not authorize a payment or commit either party."}
                    </p>
                    {!execution && task.status !== "AGREEMENT_READY" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setActiveTab("execution")}
                        className="mt-3"
                      >
                        Return to professional discussions
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {/* Recorded task activity */}
            {currentTab === "activity" && (
              <div className="workpay-card overflow-hidden">
                <div className="border-b border-[var(--wp-border)] p-5 sm:p-6">
                  <h2 className="text-lg font-semibold text-[var(--charcoal)]">Task activity</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Updates recorded as this task moves forward.
                  </p>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
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
                          className="flex items-baseline justify-between gap-4 p-4 text-xs sm:p-5 sm:text-sm"
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--wp-accent)]" />
                            <div>
                              <span className="font-semibold text-[var(--charcoal)]">
                                {entry.title}
                              </span>
                              {entry.description && (
                                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                  {entry.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <time
                            dateTime={entry.occurredAt}
                            className="shrink-0 font-mono text-xs text-[var(--text-muted)]"
                          >
                            {timeStr}
                          </time>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                      No activity has been recorded for this task yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
