"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitReviewPackageDecision } from "@/lib/api/endpoints";
import type { ReviewPackageDecision, ReviewPackageDto, TaskStatus } from "@/lib/api/types";

const decisionCopy: Record<ReviewPackageDecision, { label: string; description: string }> = {
  APPROVED: {
    label: "Approve delivery",
    description: "Record that the submitted work meets the agreement.",
  },
  CHANGES_REQUESTED: {
    label: "Request changes",
    description: "Return the delivery for a new submission.",
  },
  REJECTED: {
    label: "Reject current submission",
    description: "Record non-acceptance and return the task for a new submission.",
  },
  EXTERNAL_REVIEW_REQUESTED: {
    label: "Use agreed external review",
    description: "Escalate only after all parties accepted a reviewer engagement.",
  },
};

export function ReviewPackagePanel({
  taskId,
  taskTitle,
  contractSummary,
  taskStatus,
  reviewPackage,
  onChanged,
}: {
  taskId: string;
  taskTitle: string;
  contractSummary?: string | null;
  taskStatus: TaskStatus;
  reviewPackage: ReviewPackageDto | null;
  onChanged: () => void;
}) {
  const [decision, setDecision] = useState<ReviewPackageDecision | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!reviewPackage) {
    return (
      <section className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4">
        <h3 className="text-sm font-semibold text-[var(--wp-text-primary)]">Buyer review</h3>
        <p className="mt-1 text-sm text-[var(--wp-text-secondary)]">
          The evidence package will appear after automated checks finish. Those checks provide
          evidence only and cannot accept the work or release payment.
        </p>
      </section>
    );
  }

  const canDecide = taskStatus === "AWAITING_CLIENT_REVIEW" && !reviewPackage.reviewerDecision;
  const submitDecision = async () => {
    if (!decision || reason.trim().length < 8 || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await submitReviewPackageDecision(
      taskId,
      {
        packageId: reviewPackage.id,
        decision,
        reason: reason.trim(),
        expectedContractVersion: reviewPackage.contractVersion,
        expectedContractHash: reviewPackage.contractHash,
        expectedSubmissionVersion: reviewPackage.submissionVersion,
        expectedSubmissionHash: reviewPackage.submissionHash,
      },
      crypto.randomUUID(),
    );
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onChanged();
  };

  return (
    <section className="space-y-5 rounded-xl border border-[var(--wp-border)] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--wp-accent)]">
            Buyer review · submission v{reviewPackage.submissionVersion}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--wp-text-primary)]">{taskTitle}</h3>
          <p className="mt-1 text-sm text-[var(--wp-text-secondary)]">
            {contractSummary ?? reviewPackage.summary}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-[var(--wp-accent-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--wp-accent)]">
          {reviewPackage.status.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-950">
        <p className="font-semibold">Human approval is the acceptance gate.</p>
        <p className="mt-1 leading-relaxed text-emerald-900">
          Verification results and external reports are evidence. They never approve this delivery
          or release simulated payment on their own.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4">
          <h4 className="text-sm font-semibold text-[var(--wp-text-primary)]">Provider summary</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--wp-text-secondary)]">
            {reviewPackage.summary}
          </p>
          {reviewPackage.notes ? (
            <p className="mt-3 border-t border-[var(--wp-border)] pt-3 text-sm text-[var(--wp-text-secondary)]">
              {reviewPackage.notes}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4">
          <h4 className="text-sm font-semibold text-[var(--wp-text-primary)]">
            Submitted evidence
          </h4>
          {reviewPackage.fileReferences.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {reviewPackage.fileReferences.map((file) => (
                <li
                  key={file.id}
                  className="rounded-lg border border-[var(--wp-border)] bg-white text-sm"
                >
                  <a
                    href={`/api/v1/submissions/${encodeURIComponent(reviewPackage.submissionId)}/artifacts/${encodeURIComponent(file.id)}`}
                    className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--wp-accent-subtle)]"
                  >
                    <FileText
                      className="h-4 w-4 shrink-0 text-[var(--wp-accent)]"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-[var(--wp-text-muted)]">
                      {(file.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--wp-text-secondary)]">
              No artifacts were attached.
            </p>
          )}
        </div>
      </div>

      {reviewPackage.knownIssues.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Evidence requiring attention
          </h4>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
            {reviewPackage.knownIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviewPackage.advisoryReport ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-violet-950">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Independent review evidence · {reviewPackage.advisoryReport.outcome.toLowerCase()}
          </h4>
          <p className="mt-2 text-sm leading-6 text-violet-900">
            {reviewPackage.advisoryReport.rationale}
          </p>
          <p className="mt-2 text-xs text-violet-800">
            This report is advisory. Record your own buyer decision below.
          </p>
        </div>
      ) : null}

      {reviewPackage.reviewerDecision ? (
        <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--wp-text-primary)]">
            {reviewPackage.reviewerDecision === "APPROVED" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            ) : reviewPackage.reviewerDecision === "REJECTED" ? (
              <XCircle className="h-4 w-4 text-rose-700" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-amber-700" />
            )}
            {decisionCopy[reviewPackage.reviewerDecision].label}
          </p>
          <p className="mt-2 text-sm text-[var(--wp-text-secondary)]">
            {reviewPackage.decisionReason}
          </p>
        </div>
      ) : null}

      {canDecide ? (
        <div className="space-y-4 border-t border-[var(--wp-border)] pt-5">
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--wp-text-primary)]">
              Record your decision
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(Object.keys(decisionCopy) as ReviewPackageDecision[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={decision === value}
                  onClick={() => setDecision(value)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    decision === value
                      ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]"
                      : "border-[var(--wp-border)] hover:bg-[var(--wp-surface-subtle)]"
                  }`}
                >
                  <span className="block text-sm font-semibold text-[var(--wp-text-primary)]">
                    {decisionCopy[value].label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--wp-text-secondary)]">
                    {decisionCopy[value].description}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-[var(--wp-text-primary)]">
            Reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              minLength={8}
              maxLength={4_000}
              placeholder="Explain what you reviewed and why you made this decision."
              className="mt-2 w-full rounded-xl border border-[var(--wp-border-strong)] bg-white px-3 py-2 text-sm"
            />
          </label>
          {error ? (
            <p className="text-sm text-[var(--wp-danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={!decision || reason.trim().length < 8 || submitting}
            onClick={() => void submitDecision()}
          >
            {submitting ? "Recording decision…" : "Record buyer decision"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
