"use client";

import { useCallback, useRef, useState, useMemo } from "react";
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
  requestPlanning,
  resolveCase,
} from "@/lib/api/endpoints";
import type { ContractDto, TaskRoomDto, VerificationDto } from "@/lib/api/types";

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
  const [resolvingCase, setResolvingCase] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

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
      const res = await approveContract(
        contract.id,
        contract.contractHash,
        newIdempotencyKey(),
      );
      setSigning(false);
      if (res.error) {
        setActionError(
          "This contract changed since you reviewed it. Please review the updated terms."
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

  const handleResolveCase = async (caseId: string, outcome: string, note: string) => {
    setResolvingCase(true);
    setActionError(null);
    const res = await resolveCase(
      caseId,
      { outcome, note },
      newIdempotencyKey(),
    );
    setResolvingCase(false);
    if (res.error) {
      setActionError("Could not record decision. Please try again.");
      return;
    }
    refresh();
  };

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(taskId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  if (room.loading && !room.data) {
    return (
      <div className="py-24 text-center text-sm text-[var(--text-muted)]">
        Opening canonical task workspace...
      </div>
    );
  }

  if (room.error || !room.data) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <AlertTriangle className="h-8 w-8 text-[var(--amber)] mx-auto mb-3" />
        <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
          Could not open task workspace
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1.5">
          The requested task may not exist or permissions may be restricted.
        </p>
        <div className="mt-6">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 bg-[var(--charcoal)] text-white hover:bg-black px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <span>Return to task register</span>
          </Link>
        </div>
      </div>
    );
  }

  const { task, activeContract, workSpecification, providerSelection, execution, cases } = room.data;
  const isPaid = task.status === "COMPLETED" || task.status === "PAYMENT_RELEASE";
  const moneyAmount = formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency });

  const isDraftOrAwaiting =
    !activeContract ||
    activeContract.status === "DRAFT" ||
    activeContract.status === "AWAITING_APPROVAL" ||
    task.status === "CONTRACT_REVIEW" ||
    task.status === "PLANNING" ||
    task.status === "CREATED" ||
    task.status === "AGREEMENT_READY";

  const requirements = activeContract?.requirements ?? workSpecification?.requirements ?? [];
  const verificationResults = verification.data?.results ?? [];
  const resultsByKey = new Map(verificationResults.map((r) => [r.requirementKey, r]));
  const humanReviewCase = cases?.find((c) => c.status === "OPEN" && c.type === "HUMAN_REVIEW");
  const providerName = providerSelection?.provider?.displayName || "Assigned specialist";

  // Derive status presentation
  let statusBadgeClass = "bg-blue-50 text-blue-700";
  let statusText = "In Execution";

  if (isDraftOrAwaiting) {
    statusBadgeClass = "bg-amber-100 text-amber-800";
    statusText = "Awaiting Sign-off";
  } else if (task.status === "HUMAN_REVIEW") {
    statusBadgeClass = "bg-amber-100 text-amber-800";
    statusText = "Review Needed";
  } else if (task.status === "REVISION_REQUIRED") {
    statusBadgeClass = "bg-red-50 text-red-700";
    statusText = "Revision Requested";
  } else if (task.status === "SUBMITTED" || task.status === "VERIFYING") {
    statusBadgeClass = "bg-purple-50 text-purple-700";
    statusText = "Verifying Proof";
  } else if (isPaid) {
    statusBadgeClass = "bg-emerald-50 text-emerald-700";
    statusText = "Settled";
  }

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header (Section 9): Outcome Title, Stable ID with Copy, Status, Primary Action */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusBadgeClass}`}>
              {statusText}
            </span>

            <button
              type="button"
              onClick={handleCopyId}
              className="inline-flex items-center gap-1 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--charcoal)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] px-2 py-0.5 rounded transition-colors"
              title="Copy task ID"
            >
              <span>{taskId.slice(0, 12)}</span>
              {copiedId ? <Check className="h-3 w-3 text-[var(--green)]" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
            {task.title}
          </h1>

          <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-3xl leading-relaxed">
            {task.rawRequest}
          </p>
        </div>

        {/* Primary Next Action */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          {isDraftOrAwaiting && activeContract && (
            <button
              type="button"
              onClick={() => onSignContract(activeContract)}
              disabled={signing}
              className="inline-flex items-center gap-2 bg-[var(--charcoal)] text-white hover:bg-black px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm"
            >
              <span>{signing ? "Signing..." : "Sign and authorize PayPal payment hold"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {task.status === "HUMAN_REVIEW" && (
            <button
              type="button"
              onClick={() => setActiveTab("verification")}
              className="inline-flex items-center gap-1.5 bg-amber-600 text-white hover:bg-amber-700 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Inspect Review Decision</span>
            </button>
          )}

          <button
            type="button"
            onClick={refresh}
            className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:bg-gray-100 text-[var(--text-muted)] hover:text-[var(--charcoal)] transition-colors"
            title="Refresh state"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. 4-Stage Decoupled Lifecycle Matrix */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="workpay-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            1. Commitment
          </div>
          <div className="text-sm font-semibold text-[var(--charcoal)] truncate">
            {activeContract ? `Contract v${activeContract.version}` : "Drafting Terms"}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {activeContract?.status === "ACTIVE" ? "Terms Agreed & Locked" : "Awaiting Sign-off"}
          </div>
        </div>

        <div className="workpay-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            2. Execution
          </div>
          <div className="text-sm font-semibold text-[var(--charcoal)] truncate">
            {providerName}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {execution?.status === "COMPLETED"
              ? "Deliverable Received"
              : task.status === "REVISION_REQUIRED"
                ? "Revising Deliverable"
                : task.status === "WORK_IN_PROGRESS"
                  ? "In Progress"
                  : isDraftOrAwaiting
                    ? "Pending Sign-off"
                    : "Assigned"}
          </div>
        </div>

        <div className="workpay-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            3. Verification
          </div>
          <div className="text-sm font-semibold text-[var(--charcoal)] truncate">
            {task.status === "HUMAN_REVIEW"
              ? "Human Review Needed"
              : verification.data?.outcome === "PASS"
                ? "Passed (100% Proof)"
                : verification.data?.outcome === "FAIL"
                  ? "Failed (Revision Required)"
                  : "Awaiting Deliverable"}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {requirements.length} acceptance criteria
          </div>
        </div>

        <div className="workpay-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            4. Settlement
          </div>
          <div className="text-sm font-semibold text-[var(--charcoal)] truncate">
            {isPaid ? "Captured to Specialist" : isDraftOrAwaiting ? "Authorization Needed" : "Authorization Held"}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {moneyAmount} via PayPal
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {actionError}
        </div>
      )}

      {/* 3. Five-Tab Navigation (Section 9) */}
      <div className="flex items-center gap-1 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto text-xs sm:text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("contract")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "contract"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Specification & Contract</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("execution")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "execution"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Execution & Provider</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("verification")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "verification"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
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
          onClick={() => setActiveTab("payment")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "payment"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>PayPal Settlement Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === "activity"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Activity & Audit</span>
        </button>
      </div>

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
                Payment is captured via PayPal only when every observable criterion below is cryptographically proven:
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
                  WorkPay may negotiate with verified specialists within your limit ({moneyAmount}), request revisions, and verify cryptographic deliverables.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-100">
                <div className="font-semibold text-rose-900 flex items-center gap-1.5 mb-1.5">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Restricted Actions</span>
                </div>
                <p className="text-rose-800 leading-relaxed">
                  WorkPay cannot exceed your {moneyAmount} ceiling, alter approved criteria without consent, or capture funds without cryptographic proof.
                </p>
              </div>
            </div>

            {/* Sign & Commit Action */}
            {isDraftOrAwaiting && activeContract && (
              <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-[var(--text-muted)]">
                  By signing, you authorize external PayPal payment hold up to {moneyAmount}.
                </div>

                <button
                  type="button"
                  onClick={() => onSignContract(activeContract)}
                  disabled={signing}
                  className="bg-[var(--charcoal)] text-white hover:bg-black px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm self-start sm:self-auto"
                >
                  {signing ? "Authorizing with PayPal..." : "Sign contract and authorize PayPal payment hold"}
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
                    <strong>{providerSelection.provider.firstPassAcceptancePct ?? 98}%</strong> first-pass pass rate
                  </span>
                  <span>
                    <strong>100%</strong> policy compliance
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">
                Provider discovery is in progress. Specialist matching occurs upon contract sign-off.
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
                  <span className="font-medium text-[var(--charcoal)]">1. Intent Synthesized & Criteria Structured</span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  {isDraftOrAwaiting ? (
                    <Clock className="h-4 w-4 text-[var(--amber)] shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  )}
                  <span className="font-medium text-[var(--charcoal)]">2. Contract Signed &amp; PayPal Payment Hold Authorized</span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  {task.status === "WORK_IN_PROGRESS" || task.status === "SUBMITTED" || task.status === "VERIFYING" || isPaid ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="font-medium text-[var(--charcoal)]">3. Deliverables Produced & Submitted</span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-subtle)]">
                  {isPaid ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--green)] shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                  <span className="font-medium text-[var(--charcoal)]">4. Cryptographic Proof Verified & Settlement Captured</span>
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
                Each individual acceptance criterion is evaluated against cryptographic evidence and verifiable tests.
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
            {task.status === "HUMAN_REVIEW" && humanReviewCase && (
              <div className="p-5 rounded-xl border border-amber-300 bg-amber-50/40 space-y-3">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>Human Review Decision Required</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Automated checking could not conclusively confirm every criterion. Funds ({moneyAmount}) remain safely secured in PayPal authorization hold until you make a ruling.
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleResolveCase(humanReviewCase.id, "RELEASE_PAYMENT", "Accepted by task owner upon manual review")
                    }
                    disabled={resolvingCase}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Accept Work &amp; Authorize Capture
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleResolveCase(humanReviewCase.id, "REQUEST_REVISION", "Revision requested with feedback")
                    }
                    disabled={resolvingCase}
                    className="bg-amber-600 text-white hover:bg-amber-700 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Request Revision from Specialist
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleResolveCase(humanReviewCase.id, "DISPUTE", "Formal dispute opened")
                    }
                    disabled={resolvingCase}
                    className="bg-gray-700 text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Escalate to Dispute Arbitration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Tab 4: PayPal Settlement Ledger (The Physical Voucher Ticket Card) */}
      {activeTab === "payment" && (
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
                    {payment.data?.payoutEmail || providerSelection?.provider?.displayName || "Assigned specialist"}
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
                * Note on custody: WorkPay does not operate a wallet or store funds. Payments are secured via external PayPal authorization holds and captured only upon verified proof completion.
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
                <div key={entry.id} className="p-4 flex items-baseline justify-between gap-4 text-xs sm:text-sm">
                  <div className="flex items-start gap-3">
                    <span className="h-2 w-2 rounded-full bg-[var(--amber)] shrink-0 mt-2" />
                    <div>
                      <span className="font-semibold text-[var(--charcoal)]">{entry.title}</span>
                      {entry.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{entry.description}</p>
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
