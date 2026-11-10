"use client";

import { useCallback, useState } from "react";
import { formatMinorMoney } from "@/lib/format";
import { acceptProviderWork, startProviderWork } from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";
import { ProviderReviewContext } from "./provider-review-context";

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

  const accept = useCallback(async () => {
    setBusy("accept");
    setError(null);
    const res = await acceptProviderWork(work.executionId, newIdempotencyKey());
    setBusy(null);
    if (res.error) {
      setError("Could not accept this work order. It may have changed.");
    } else {
      onChanged();
    }
  }, [work.executionId, onChanged]);

  const start = useCallback(async () => {
    setBusy("start");
    setError(null);
    const res = await startProviderWork(work.executionId, newIdempotencyKey());
    setBusy(null);
    if (res.error) {
      setError("Could not record start of work.");
    } else {
      onChanged();
    }
  }, [work.executionId, onChanged]);

  const isAccepted = work.status === "COMPLETED";
  const moneyAmount = formatMinorMoney(work.pay);

  return (
    <>
      <p className="screen-label">Work order</p>
      <div className="sheet relative">
        <div className="sheet-meta">Work order commitment</div>
        <h1 className="sheet-title">{work.taskTitle}</h1>
        <p style={{ color: "var(--ink-soft)" }}>{work.taskRequest}</p>

        <hr className="rule" />

        <div className="cols3">
          <div>
            <div className="lbl">Agreed amount</div>
            <span className="amount">{moneyAmount}</span>
            <p className="lbl mt-1">
              Payment states are simulated. No funds are held while buyer review is pending.
            </p>
          </div>
          <div>
            <div className="lbl">Payment status</div>
            Awaiting approval gate
          </div>
          <div>
            <div className="lbl">Due</div>
            {work.deadline
              ? new Date(work.deadline).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Not specified"}
          </div>
        </div>

        <hr className="rule" />

        <div className="sheet-meta mb-2">Requirements</div>
        <ol style={{ margin: "var(--space-2) 0 0", paddingLeft: "1.4rem" }}>
          {work.requirements.map((req, idx) => (
            <li
              key={req.key || idx}
              className="py-1.5 border-b border-[var(--paper-rule)] last:border-b-0"
            >
              <span>{req.statement}</span>
            </li>
          ))}
        </ol>

        {error && <p className="note note-fail mt-4">{error}</p>}

        {/* Action based on status */}
        <div className="mt-6 pt-4 border-t border-[var(--ink)]">
          {work.status === "ASSIGNED" && (
            <div className="sheet-actions mt-0 pt-0 border-t-0">
              <button type="button" onClick={accept} disabled={busy === "accept"} className="btn">
                {busy === "accept" ? "Accepting..." : "Accept work"}
              </button>
              <span className="lbl">
                {moneyAmount} is the agreed amount. No funds move in the current simulation.
              </span>
            </div>
          )}

          {work.status === "ACCEPTED" && (
            <div className="sheet-actions mt-0 pt-0 border-t-0">
              <button type="button" onClick={start} disabled={busy === "start"} className="btn">
                {busy === "start" ? "Starting..." : "Start work"}
              </button>
              <span className="lbl">Confirm you have begun execution.</span>
            </div>
          )}

          {(work.status === "IN_PROGRESS" || work.status === "REVISION_REQUESTED") && (
            <div className="space-y-4">
              {work.status === "REVISION_REQUESTED" && work.revisionReason ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <strong className="block">Buyer revision reason</strong>
                  <span className="mt-1 block">{work.revisionReason}</span>
                </div>
              ) : null}
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
                <strong className="block">Keep progress connected to the actual work.</strong>
                <p className="mt-1 leading-6 text-indigo-900">
                  Continue the real work wherever it lives: a website, repository, meeting, live
                  system, document, or physical setting. The client can open a checkpoint or final
                  review when useful.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--paper-rule)] p-3">
                  <div className="lbl">Accepted checkpoints</div>
                  <div className="mt-1 text-xl font-semibold">{work.acceptedCheckpointCount}</div>
                </div>
                <div className="rounded-xl border border-[var(--paper-rule)] p-3">
                  <div className="lbl">Current review</div>
                  <div className="mt-1 text-sm font-semibold">Waiting for client to open</div>
                </div>
              </div>
            </div>
          )}

          {(work.status === "REVIEW_REQUESTED" || work.status === "UNDER_REVIEW") &&
          work.activeReviewId ? (
            <ProviderReviewContext reviewId={work.activeReviewId} onChanged={onChanged} />
          ) : null}

          {work.status === "SUBMITTED" && (
            <div>
              <p className="note note-unsure">
                This work is ready to move into the review workspace.
              </p>
              <p className="lbl mt-2">
                Continue with the current agreement constraints and review context.
              </p>
            </div>
          )}

          {isAccepted && (
            <div className="flex items-center justify-between">
              <p className="note note-met">
                The final work was accepted against the current agreement. Payment release is
                tracked separately.
              </p>
              <div className="stamp note-met">Delivery accepted</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
