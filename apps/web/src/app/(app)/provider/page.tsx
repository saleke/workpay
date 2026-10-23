"use client";

import Link from "next/link";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listProviderWork } from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";

function getProviderRowInfo(w: ProviderWorkDto) {
  const isPaid = w.status === "COMPLETED";
  const moneyStr = formatMinorMoney(w.pay);

  let stateLabel = "In progress";
  let noteClass = "text-[var(--ink-muted)]";
  let noteText = "Deliverable in progress.";

  if (w.status === "ASSIGNED") {
    stateLabel = "Assigned";
    noteClass = "note-unsure";
    noteText = "Matched assignment awaiting your acceptance.";
  } else if (w.status === "ACCEPTED") {
    stateLabel = "Accepted";
    noteClass = "text-[var(--ink-muted)]";
    noteText = "Contract accepted. Ready to start.";
  } else if (w.status === "REVISION_REQUESTED") {
    stateLabel = "Revision requested";
    noteClass = "note-fail";
    noteText = "One or more requirements need correction.";
  } else if (w.status === "SUBMITTED") {
    stateLabel = "Submitted";
    noteClass = "note-unsure";
    noteText = "Work submitted. Verification is running.";
  } else if (isPaid) {
    stateLabel = "Paid";
    noteClass = "note-met";
    noteText = "Every requirement met. Payment released.";
  }

  const deadlineText = w.deadline
    ? `Due ${new Date(w.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "No deadline specified";

  const metaLine = `${w.requirements.length} requirement${w.requirements.length === 1 ? "" : "s"}, ${deadlineText}`;

  return {
    stateLabel,
    noteClass,
    noteText,
    isPaid,
    moneyStr,
    metaLine,
  };
}

export default function ProviderPortalPage() {
  const { data, loading } = useApi(() => listProviderWork(), [], "provider-work");
  const works = data ?? [];

  if (loading && works.length === 0) {
    return (
      <div className="py-20 text-center text-[var(--room-muted)] font-serif">
        Retrieving available assignments...
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          No work assignments right now
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          WorkPay matches specialist profiles with buyers based on past delivery proofs and skill fit.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="screen-label">Work studio</p>
      <div className="sheet">
        <div
          className="register-row heads"
          style={{ paddingTop: 0, borderBottom: "var(--rule) solid var(--ink)" }}
        >
          <span className="lbl">Work order</span>
          <span className="lbl">Money</span>
          <span className="lbl">State</span>
        </div>

        {works.map((w) => {
          const info = getProviderRowInfo(w);

          return (
            <div key={w.executionId} className="register-row">
              <div>
                <div className="row-title">
                  <Link href={`/provider/${w.executionId}`} className="hover:underline">
                    {w.taskTitle}
                  </Link>
                </div>
                <div className="lbl">{info.metaLine}</div>
                <div className={`note ${info.noteClass}`}>{info.noteText}</div>
              </div>

              <div className="money amount">
                {info.moneyStr} <span className="lbl">{info.isPaid ? "paid" : "held"}</span>
              </div>

              <div className="state">
                <span className={`state-label ${info.noteClass}`}>{info.stateLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
