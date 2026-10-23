"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
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

  const [signing, setSigning] = useState(false);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [newRequirementText, setNewRequirementText] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolvingCase, setResolvingCase] = useState(false);

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

  if (room.loading && !room.data) {
    return (
      <div className="py-20 text-center text-[var(--room-muted)] font-serif">
        Retrieving contract...
      </div>
    );
  }

  if (room.error || !room.data) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          We could not open this contract
        </h1>
        <p className="text-[var(--room-muted)] mt-2">
          The contract may not exist, or you may not have access to it.
        </p>
        <div className="mt-6">
          <Link href="/tasks" className="btn btn-room">
            Return to tasks
          </Link>
        </div>
      </div>
    );
  }

  const { task, activeContract, workSpecification, providerSelection, execution, cases } = room.data;
  const isPaid = task.status === "COMPLETED" || task.status === "PAYMENT_RELEASE";
  const moneyAmount = formatMinorMoney({ amountMinor: task.budgetMinor, currency: task.currency });

  // Check if contract is waiting for signing
  const isDraftOrAwaiting =
    !activeContract ||
    activeContract.status === "DRAFT" ||
    activeContract.status === "AWAITING_APPROVAL" ||
    task.status === "CONTRACT_REVIEW" ||
    task.status === "PLANNING" ||
    task.status === "CREATED";

  // CASE 1: CONTRACT DRAFTING IN PROGRESS
  if (!activeContract && (task.status === "CREATED" || task.status === "PLANNING")) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          Drafting your contract...
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          WorkPay is analyzing your request to formulate requirements.
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => requestPlanning(taskId).then(() => refresh())}
            className="btn btn-room"
          >
            Synthesize requirements now
          </button>
        </div>
      </div>
    );
  }

  // CASE 2: CONTRACT APPROVAL SHEET (Screens.html lines 84-106)
  if (isDraftOrAwaiting && activeContract) {
    const requirements = activeContract.requirements ?? workSpecification?.requirements ?? [];
    const expectedPriceMinor = activeContract.budgetMinor || task.budgetMinor;
    const expectedPriceStr = formatMinorMoney({ amountMinor: expectedPriceMinor, currency: task.currency });

    return (
      <>
        <p className="screen-label">Contract approval</p>
        <div className="sheet">
          <div className="sheet-meta">
            Work contract, draft v{activeContract.version}, prepared by WorkPay, not yet signed
          </div>
          <h1 className="sheet-title">{task.title}</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            {activeContract.summary || task.rawRequest}
          </p>

          <hr className="rule" />

          <div className="sheet-meta">Payment is released only when every requirement is met</div>
          <ol style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.4rem" }}>
            {requirements.map((req, idx) => (
              <li key={req.key || idx} className="py-1">
                <span>{req.statement}</span>
                {editingRequirements && (
                  <button
                    type="button"
                    onClick={() => onDeleteRequirement(activeContract.id, req.key)}
                    disabled={isModifying}
                    className="ml-3 text-[var(--text-label)] text-[var(--ink-fail)] hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ol>

          {editingRequirements && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newRequirementText}
                onChange={(e) => setNewRequirementText(e.target.value)}
                placeholder="Add another requirement..."
                className="flex-1 bg-transparent border-0 border-b border-[var(--paper-rule)] focus:border-[var(--ink)] text-[var(--text-body)] font-serif text-[var(--ink)] focus:outline-none py-1"
              />
              <button
                type="button"
                onClick={() => onAddRequirement(activeContract.id)}
                disabled={isModifying || !newRequirementText.trim()}
                className="btn btn-quiet"
              >
                Add
              </button>
            </div>
          )}

          <hr className="rule" />

          <div className="cols3">
            <div>
              <div className="lbl">Spend up to</div>
              <span className="amount">{moneyAmount}</span>
            </div>
            <div>
              <div className="lbl">Deadline</div>
              {task.desiredDeadline ? new Date(task.desiredDeadline).toLocaleDateString() : "Tomorrow, 6:00 PM"}
            </div>
            <div>
              <div className="lbl">Expected price</div>
              <span className="amount">{expectedPriceStr}</span>
            </div>
          </div>

          <hr className="rule" />

          <div className="pair">
            <div>
              <div className="lbl note-met">WorkPay may</div>
              Find and negotiate with providers within your limit. Authorize up to {moneyAmount}. Request corrections.
            </div>
            <div>
              <div className="lbl note-fail">WorkPay may not</div>
              Raise your limit. Change a requirement. Pay for work that fails a requirement.
            </div>
          </div>

          {actionError && (
            <p className="note note-fail mt-4">{actionError}</p>
          )}

          <div className="sheet-actions">
            <button
              type="button"
              onClick={() => onSignContract(activeContract)}
              disabled={signing}
              className="btn"
            >
              {signing ? "Signing contract..." : "Sign and let WorkPay hire"}
            </button>
            <button
              type="button"
              onClick={() => setEditingRequirements(!editingRequirements)}
              className="btn btn-quiet"
            >
              {editingRequirements ? "Done editing" : "Edit requirements"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // CASE 3: CONTRACT IN FORCE SHEET (Workspace, DESIGN_BRIEF section 7.5)
  const requirements = activeContract?.requirements ?? workSpecification?.requirements ?? [];
  const verificationResults = verification.data?.results ?? [];
  const resultsByKey = new Map(verificationResults.map((r) => [r.requirementKey, r]));

  // Find human review case if any
  const humanReviewCase = cases?.find((c) => c.status === "OPEN" && c.type === "HUMAN_REVIEW");
  const providerName = providerSelection?.provider?.displayName || "Assigned specialist";

  return (
    <>
      <p className="screen-label">Contract in force</p>
      <div className="sheet relative">
        <div className="sheet-meta">
          Contract v{activeContract?.version ?? 1}, signed by you
        </div>
        <h1 className="sheet-title">{task.title}</h1>

        <p style={{ color: "var(--ink-soft)" }}>
          {isPaid
            ? `${moneyAmount} was paid to ${providerName}.`
            : `${moneyAmount} is held. It is released only when every requirement is met.`}
        </p>

        <hr className="rule" />

        <div className="sheet-meta mb-2">Requirements and proof</div>
        <ol style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.4rem" }}>
          {requirements.map((req, idx) => {
            const result = resultsByKey.get(req.key);
            let resultNote = "No work submitted yet.";
            let noteClass = "text-[var(--ink-muted)]";

            if (result) {
              if (result.outcome === "PASS") {
                resultNote = "Met";
                noteClass = "note-met";
              } else if (result.outcome === "FAIL") {
                resultNote = result.actual
                  ? `Found ${result.actual}. Not met.`
                  : "Not met.";
                noteClass = "note-fail";
              } else if (result.outcome === "UNCERTAIN") {
                resultNote = "Unsure. The verifier could not decide.";
                noteClass = "note-unsure";
              }
            } else if (isPaid) {
              resultNote = "Met";
              noteClass = "note-met";
            }

            return (
              <li key={req.key || idx} className="py-2 border-b border-[var(--paper-rule)] last:border-b-0">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <span>{req.statement}</span>
                  <span className={`note ${noteClass} shrink-0 text-sm`}>
                    {resultNote}
                  </span>
                </div>

                {result && result.outcome !== "PASS" && result.explanation && (
                  <p className="text-sm font-serif text-[var(--ink-soft)] mt-1 italic">
                    Evidence: {result.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        {/* Human review decision block if verification is unsure */}
        {task.status === "HUMAN_REVIEW" && (
          <div className="mt-6 pt-4 border-t border-[var(--ink)]">
            <div className="sheet-meta">Review needed</div>
            <h2 className="font-serif text-[1.125rem] text-[var(--ink)] mt-1">
              Verification could not decide
            </h2>
            <p className="note note-unsure text-sm mt-1">
              Automated checking could not conclusively confirm every requirement.
            </p>
            <p className="lbl mt-3">
              {moneyAmount} stays held until you decide.
            </p>
            <div className="sheet-actions mt-3">
              <button
                type="button"
                onClick={() =>
                  humanReviewCase &&
                  handleResolveCase(humanReviewCase.id, "RELEASE_PAYMENT", "Accepted by buyer")
                }
                disabled={resolvingCase}
                className="btn"
              >
                Accept the work
              </button>
              <button
                type="button"
                onClick={() =>
                  humanReviewCase &&
                  handleResolveCase(humanReviewCase.id, "REQUEST_REVISION", "Revision requested by buyer")
                }
                disabled={resolvingCase}
                className="btn btn-quiet"
              >
                Ask for a revision
              </button>
              <button
                type="button"
                onClick={() =>
                  humanReviewCase &&
                  handleResolveCase(humanReviewCase.id, "DISPUTE", "Dispute opened by buyer")
                }
                disabled={resolvingCase}
                className="btn btn-quiet"
              >
                Open a dispute
              </button>
            </div>
          </div>
        )}

        {/* Provider section (Section 7.6) */}
        {providerSelection?.provider && (
          <>
            <hr className="rule" />
            <div className="sheet-meta">Provider</div>
            <div className="mt-2">
              <div className="font-serif text-[1.125rem] text-[var(--ink)]">
                {providerSelection.provider.displayName}
              </div>
              <p className="lbl mt-0.5">
                {providerSelection.provider.firstPassAcceptancePct ?? 98}% pass rate on first submission
              </p>
              {providerSelection.reason && (
                <p className="note text-sm text-[var(--ink-soft)] mt-1">
                  {providerSelection.reason}
                </p>
              )}
            </div>
          </>
        )}

        {/* Physical stamp at lower right */}
        <div className="mt-6 flex justify-end">
          {isPaid ? (
            <div className="stamp note-met">Paid</div>
          ) : (
            <div className="stamp note-fail">Payment held</div>
          )}
        </div>

        {/* Activity section (Section 7.5 item 6) */}
        <hr className="rule" />
        <div className="sheet-meta mb-2">Activity</div>
        {activity.data && activity.data.length > 0 ? (
          <div className="space-y-2 text-sm font-serif">
            {activity.data.map((entry, idx) => (
              <div key={entry.id || idx} className="flex items-baseline justify-between gap-4">
                <span className="text-[var(--ink)]">{entry.title}</span>
                <span className="lbl shrink-0">
                  {new Date(entry.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="lbl">No activity recorded yet.</p>
        )}
      </div>
    </>
  );
}
