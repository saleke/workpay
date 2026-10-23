"use client";

import { useCallback, useRef, useState } from "react";
import { formatMinorMoney } from "@/lib/format";
import {
  acceptProviderWork,
  startProviderWork,
  submitDeliverable,
} from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";

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

  const submit = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please choose a file to submit.");
      return;
    }
    setBusy("submit");
    setError(null);
    const res = await submitDeliverable(work.executionId, file, note.trim(), newIdempotencyKey());
    setBusy(null);
    if (res.error) {
      setError("Submission could not be recorded. Please try again.");
    } else {
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      onChanged();
    }
  }, [work.executionId, note, onChanged]);

  const isPaid = work.status === "COMPLETED";
  const moneyAmount = formatMinorMoney(work.pay);

  return (
    <>
      <p className="screen-label">Work order</p>
      <div className="sheet relative">
        <div className="sheet-meta">
          Work order commitment
        </div>
        <h1 className="sheet-title">{work.taskTitle}</h1>
        <p style={{ color: "var(--ink-soft)" }}>{work.taskRequest}</p>

        <hr className="rule" />

        <div className="cols3">
          <div>
            <div className="lbl">You are paid</div>
            <span className="amount">{moneyAmount}</span>
          </div>
          <div>
            <div className="lbl">When</div>
            Once every requirement is met
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
            <li key={req.key || idx} className="py-1.5 border-b border-[var(--paper-rule)] last:border-b-0">
              <span>{req.statement}</span>
            </li>
          ))}
        </ol>

        {error && (
          <p className="note note-fail mt-4">{error}</p>
        )}

        {/* Action based on status */}
        <div className="mt-6 pt-4 border-t border-[var(--ink)]">
          {work.status === "ASSIGNED" && (
            <div className="sheet-actions mt-0 pt-0 border-t-0">
              <button
                type="button"
                onClick={accept}
                disabled={busy === "accept"}
                className="btn"
              >
                {busy === "accept" ? "Accepting..." : "Accept work"}
              </button>
              <span className="lbl">
                {moneyAmount} is secured via PayPal authorization hold.
              </span>
            </div>
          )}

          {work.status === "ACCEPTED" && (
            <div className="sheet-actions mt-0 pt-0 border-t-0">
              <button
                type="button"
                onClick={start}
                disabled={busy === "start"}
                className="btn"
              >
                {busy === "start" ? "Starting..." : "Start work"}
              </button>
              <span className="lbl">
                Confirm you have begun execution.
              </span>
            </div>
          )}

          {(work.status === "IN_PROGRESS" || work.status === "REVISION_REQUESTED") && (
            <div className="space-y-4">
              <div className="sheet-meta">Submit deliverable for verification</div>
              <div>
                <label className="lbl block mb-1">Select deliverable file</label>
                <input
                  type="file"
                  ref={fileRef}
                  className="text-sm font-serif file:mr-3 file:py-1.5 file:px-3 file:rounded-[var(--radius-control)] file:border file:border-[var(--ink)] file:text-xs file:font-sans file:bg-[var(--ink)] file:text-[var(--paper)] hover:file:opacity-90 cursor-pointer"
                />
              </div>
              <div>
                <label className="lbl block mb-1">Notes on submission</label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Explain how requirements were satisfied..."
                  className="w-full bg-transparent border-0 border-b border-[var(--paper-rule)] focus:border-[var(--ink)] text-[var(--text-body)] font-serif text-[var(--ink)] placeholder:text-[var(--ink-muted)] placeholder:italic focus:outline-none py-1 resize-y"
                />
              </div>
              <div className="sheet-actions mt-2 pt-2 border-t-0">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy === "submit"}
                  className="btn"
                >
                  {busy === "submit" ? "Submitting..." : "Submit for verification"}
                </button>
                <span className="lbl">
                  Submitting work does not trigger payment. Automated verification and policy confirmation do.
                </span>
              </div>
            </div>
          )}

          {work.status === "SUBMITTED" && (
            <div>
              <p className="note note-unsure">
                Work submitted. Automated verification is running against every requirement.
              </p>
              <p className="lbl mt-2">
                Submitting work does not trigger payment. Verification does.
              </p>
            </div>
          )}

          {isPaid && (
            <div className="flex items-center justify-between">
              <p className="note note-met">
                Every requirement was met. {moneyAmount} was delivered to your PayPal account.
              </p>
              <div className="stamp note-met">Paid</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
