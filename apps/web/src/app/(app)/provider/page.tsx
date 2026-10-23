"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listProviderWork } from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";

function getProviderRowInfo(w: ProviderWorkDto) {
  const isPaid = w.status === "COMPLETED";
  const moneyStr = formatMinorMoney(w.pay);

  let stateLabel = "In progress";
  let badgeClass = "bg-blue-50 text-blue-700";
  let noteText = "Deliverable in progress.";

  if (w.status === "ASSIGNED") {
    stateLabel = "Assigned";
    badgeClass = "bg-amber-100 text-amber-800";
    noteText = "Matched assignment awaiting your acceptance.";
  } else if (w.status === "ACCEPTED") {
    stateLabel = "Accepted";
    badgeClass = "bg-blue-50 text-blue-700";
    noteText = "Contract accepted. Ready to start.";
  } else if (w.status === "REVISION_REQUESTED") {
    stateLabel = "Revision requested";
    badgeClass = "bg-rose-100 text-rose-800";
    noteText = "One or more requirements need correction.";
  } else if (w.status === "SUBMITTED") {
    stateLabel = "Submitted";
    badgeClass = "bg-purple-50 text-purple-700";
    noteText = "Work submitted. Automated verification is running.";
  } else if (isPaid) {
    stateLabel = "Settled";
    badgeClass = "bg-emerald-100 text-emerald-800";
    noteText = "Every requirement met. PayPal payout released.";
  }

  const deadlineText = w.deadline
    ? `Due ${new Date(w.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "No deadline specified";

  const metaLine = `${w.requirements.length} requirement${w.requirements.length === 1 ? "" : "s"}, ${deadlineText}`;

  return {
    stateLabel,
    badgeClass,
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
      <div className="py-20 text-center text-sm text-[var(--text-muted)]">
        Retrieving available assignments...
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <Briefcase className="h-8 w-8 text-[var(--amber)] mx-auto mb-3" />
        <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
          No active work assignments
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1.5">
          WorkPay matches specialist profiles with buyers based on verifiable skill fits and past cryptographic proofs. New orders will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
          Specialist Work Studio
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Review assignments, deliver verifiable outputs, inspect cryptographic criteria proofs, and track settlement.
        </p>
      </div>

      {/* 2. Work Orders List */}
      <div className="space-y-3">
        {works.map((w) => {
          const info = getProviderRowInfo(w);

          return (
            <Link
              key={w.executionId}
              href={`/provider/${w.executionId}`}
              className="workpay-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[var(--charcoal)] transition-all group"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${info.badgeClass}`}>
                    {info.stateLabel}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {info.metaLine}
                  </span>
                </div>

                <h2 className="text-base font-semibold text-[var(--charcoal)] group-hover:text-[var(--blue)] transition-colors">
                  {w.taskTitle}
                </h2>

                <p className="text-xs text-[var(--text-muted)]">
                  {info.noteText}
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 shrink-0">
                <div className="text-right">
                  <div className="text-base font-bold text-[var(--charcoal)]">{info.moneyStr}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {info.isPaid ? "Paid upon proof" : "PayPal Authorization Hold"}
                  </div>
                </div>

                <div className="h-8 w-8 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-muted)] group-hover:bg-[var(--charcoal)] group-hover:text-white transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
