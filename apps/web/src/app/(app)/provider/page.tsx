"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, MessageCircle } from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { getMessageInbox, listProviderWork } from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/states";

function MessagesEntryPoint() {
  const { data } = useApi(() => getMessageInbox(), [], "message-inbox");
  const responseCount =
    data?.conversations.filter(
      (conversation) =>
        conversation.status === "CONTACT_PENDING" &&
        conversation.otherParticipant.role === "client",
    ).length ?? 0;
  const activeDiscussionCount =
    data?.conversations.filter((conversation) => conversation.status === "OPEN").length ?? 0;

  return (
    <Link
      href="/messages"
      className="workpay-card flex items-center justify-between gap-4 border-[var(--wp-accent)]/25 p-4 transition hover:border-[var(--wp-accent)]/60 hover:shadow-sm"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]">
          <MessageCircle className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--wp-text-primary)]">
            Messages
          </span>
          <span className="mt-0.5 block text-xs text-[var(--wp-text-secondary)]">
            {responseCount > 0
              ? `${responseCount} contact request${responseCount === 1 ? "" : "s"} need your response`
              : `${activeDiscussionCount} active discussion${activeDiscussionCount === 1 ? "" : "s"} · all work stays in its own thread`}
          </span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--wp-text-secondary)]" />
    </Link>
  );
}

function getProviderRowInfo(w: ProviderWorkDto) {
  const isCompleted = w.status === "COMPLETED";
  const moneyStr = formatMinorMoney(w.pay);

  let stateLabel = "In progress";
  let badgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
  let noteText = "Deliverable in progress.";

  if (w.status === "ASSIGNED") {
    stateLabel = "Assigned";
    badgeClass = "bg-[var(--wp-warning-subtle)] text-[var(--wp-warning)]";
    noteText = "The assignment is awaiting your acceptance.";
  } else if (w.status === "ACCEPTED") {
    stateLabel = "Accepted";
    badgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    noteText = "Contract accepted. Ready to start.";
  } else if (w.status === "REVISION_REQUESTED") {
    stateLabel = "Revision requested";
    badgeClass = "bg-[var(--wp-danger-subtle)] text-[var(--wp-danger)]";
    noteText = "One or more requirements need correction.";
  } else if (w.status === "SUBMITTED") {
    stateLabel = "Submitted";
    badgeClass = "bg-[var(--wp-info-subtle)] text-[var(--wp-info)]";
    noteText = "Work submitted. Check the task workspace for its verification status.";
  } else if (isCompleted) {
    stateLabel = "Completed";
    badgeClass = "bg-[var(--wp-success-subtle)] text-[var(--wp-success)]";
    noteText = "The buyer accepted the submitted work. No payout was made.";
  }

  const deadlineText = w.deadline
    ? `Due ${new Date(w.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "No deadline specified";

  const metaLine = `${w.requirements.length} requirement${w.requirements.length === 1 ? "" : "s"}, ${deadlineText}`;

  return {
    stateLabel,
    badgeClass,
    noteText,
    isCompleted,
    moneyStr,
    metaLine,
  };
}

export default function ProviderPortalPage() {
  const { data, error, loading, reload } = useApi(() => listProviderWork(), [], "provider-work");
  const works = data ?? [];

  if (loading && works.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Work together"
          title="Work Studio"
          description="Respond to contact requests and manage work only after you accept the exact terms."
        />
        <div
          className="workpay-card p-8 text-center text-sm text-[var(--wp-text-secondary)]"
          role="status"
        >
          Loading assignments…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Work together"
          title="Work Studio"
          description="Respond to contact requests and manage work only after you accept the exact terms."
        />
        <ErrorState
          title="Work assignments could not be loaded"
          description={error.message}
          onRetry={reload}
        />
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Work together"
          title="Work Studio"
          description="A discussion is not a work commitment. Work appears here only after you accept the exact terms."
        />
        <MessagesEntryPoint />
        <div className="workpay-card mx-auto max-w-2xl p-8 text-center sm:p-10">
          <Briefcase className="mx-auto mb-3 h-8 w-8 text-[var(--wp-accent)]" aria-hidden="true" />
          <h2 className="text-xl font-semibold tracking-tight text-[var(--wp-text-primary)]">
            No active assignments
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--wp-text-secondary)]">
            Contact requests and accepted work appear in their own areas. A discussion does not
            create an assignment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Work together"
        title="Work Studio"
        description="Review accepted assignments, submit work, and follow the agreed review process. Contact requests are handled in Messages."
      />

      <MessagesEntryPoint />

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
                    {info.isCompleted ? "Buyer accepted work" : "Agreed amount"}
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
