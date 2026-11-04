"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listProviderWork } from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";
import { ProviderConversationInbox } from "@/components/provider/provider-conversation-inbox";

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
    noteText = "The validation workflow reached its completed state. No payout was made.";
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
      <div className="space-y-8 py-8">
        <header className="border-b border-[var(--border-subtle)] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--charcoal)] sm:text-3xl">
            Work Studio
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
            Review buyer contact requests first. A discussion is not a work commitment; confirmed
            assignments appear here when you accept the exact terms.
          </p>
        </header>
        <ProviderConversationInbox />
        <div className="py-12 text-center max-w-md mx-auto">
          <Briefcase className="h-8 w-8 text-[var(--amber)] mx-auto mb-3" />
          <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
            No active work assignments
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5">
            No accepted assignment is active. If you have an open discussion, continue it above;
            work begins only after an exact assignment is accepted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
          Work Studio
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Review contact requests, manage accepted assignments, submit work, and follow the agreed
          review process.
        </p>
      </div>

      <ProviderConversationInbox />

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
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${info.badgeClass}`}
                  >
                    {info.stateLabel}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{info.metaLine}</span>
                </div>

                <h2 className="text-base font-semibold text-[var(--charcoal)] group-hover:text-[var(--blue)] transition-colors">
                  {w.taskTitle}
                </h2>

                <p className="text-xs text-[var(--text-muted)]">{info.noteText}</p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 shrink-0">
                <div className="text-right">
                  <div className="text-base font-bold text-[var(--charcoal)]">{info.moneyStr}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {info.isPaid ? "Simulation completed" : "Agreed amount"}
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
