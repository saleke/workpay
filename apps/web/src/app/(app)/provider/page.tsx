"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CircleDollarSign,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { getMessageInbox, listProviderWork, listProviderWorkProposals } from "@/lib/api/endpoints";
import type { ProviderWorkDto } from "@/lib/api/types";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/states";
import { ProviderWorkProposalCard } from "@/components/provider/provider-work-proposal-card";

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
  } else if (w.status === "UNDER_REVIEW") {
    stateLabel = "Review open";
    badgeClass = "bg-indigo-100 text-indigo-800";
    noteText = "The client opened a review window. Add any useful context.";
  } else if (w.status === "REVIEW_REQUESTED") {
    stateLabel = "Review package requested";
    badgeClass = "bg-amber-100 text-amber-900";
    noteText = "Prepare notes, links, and optional files for the client.";
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
  const proposalQuery = useApi(() => listProviderWorkProposals(), [], "provider-work-proposals");
  const [category, setCategory] = useState<"proposed" | "accepted">("proposed");
  const works = data ?? [];
  const proposals = proposalQuery.data ?? [];
  const activeProposals = proposals.filter(
    (proposal) => proposal.status === "AWAITING_PROVIDER" || proposal.status === "AWAITING_CLIENT",
  );
  const confirmedWithoutExecution = proposals.filter(
    (proposal) => proposal.status === "CONFIRMED" && !proposal.executionId,
  );
  const closedProposals = proposals.filter(
    (proposal) =>
      proposal.status !== "AWAITING_PROVIDER" &&
      proposal.status !== "AWAITING_CLIENT" &&
      proposal.status !== "CONFIRMED",
  );

  useEffect(() => {
    const refresh = () => {
      void proposalQuery.reload();
      void reload();
    };
    window.addEventListener("workpay_commitment_change", refresh);
    const timer = window.setInterval(refresh, 8_000);
    return () => {
      window.removeEventListener("workpay_commitment_change", refresh);
      window.clearInterval(timer);
    };
  }, [proposalQuery.reload, reload]);

  useEffect(() => {
    if (
      !proposalQuery.loading &&
      activeProposals.length === 0 &&
      works.length + confirmedWithoutExecution.length > 0
    ) {
      setCategory("accepted");
    }
  }, [
    proposalQuery.loading,
    activeProposals.length,
    works.length,
    confirmedWithoutExecution.length,
  ]);

  if ((loading || proposalQuery.loading) && works.length === 0 && proposals.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Work together"
          title="Work Studio"
          description="Review proposed work separately from work you and the client have mutually accepted."
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

  if (error || proposalQuery.error) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Work together"
          title="Work Studio"
          description="Review proposed work separately from work you and the client have mutually accepted."
        />
        <ErrorState
          title="Work assignments could not be loaded"
          description={(error ?? proposalQuery.error)?.message ?? "Please try again."}
          onRetry={() => {
            void reload();
            void proposalQuery.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Work together"
        title="Work Studio"
        description="Proposed work needs your decision. Accepted work is reserved for commitments both you and the client confirmed."
      />

      <MessagesEntryPoint />

      <div className="grid overflow-hidden rounded-2xl border border-[var(--wp-border)] bg-white shadow-sm sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setCategory("proposed")}
          aria-pressed={category === "proposed"}
          className={`flex min-h-28 items-center gap-4 border-b p-5 text-left transition sm:border-b-0 sm:border-r ${
            category === "proposed"
              ? "bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_80%)] shadow-[inset_0_-3px_0_#4338ca]"
              : "hover:bg-[var(--wp-canvas)]"
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
            <ClipboardList className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-950">Work proposals</span>
              <span className="rounded-full bg-indigo-700 px-2 py-0.5 text-xs font-bold text-white">
                {activeProposals.length}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              Terms awaiting your work acceptance or the client's final confirmation.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setCategory("accepted")}
          aria-pressed={category === "accepted"}
          className={`flex min-h-28 items-center gap-4 p-5 text-left transition ${
            category === "accepted"
              ? "bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_80%)] shadow-[inset_0_-3px_0_#047857]"
              : "hover:bg-[var(--wp-canvas)]"
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-950">Accepted work</span>
              <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">
                {works.length + confirmedWithoutExecution.length}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              Mutual commitments, funded assignments, delivery, and review.
            </span>
          </span>
        </button>
      </div>

      {category === "proposed" ? (
        <section className="space-y-4" aria-label="Work proposals">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700">
                Work acceptance
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                Work proposals
              </h2>
            </div>
            <p className="hidden max-w-md text-right text-xs leading-5 text-slate-500 sm:block">
              A proposal is not an assignment. Acceptance records your intent; the client still
              makes the final selection.
            </p>
          </div>
          {activeProposals.length > 0 ? (
            activeProposals.map((proposal) => (
              <ProviderWorkProposalCard
                key={proposal.id}
                proposal={proposal}
                onChanged={() => {
                  void proposalQuery.reload();
                  window.dispatchEvent(new Event("workpay_messages_inbox_change"));
                }}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                No proposals need action
              </h3>
              <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-600">
                Work proposals appear here when a client sends scope, compensation, and delivery
                terms for your decision.
              </p>
            </div>
          )}
          {closedProposals.length > 0 ? (
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Closed proposals ({closedProposals.length})
              </summary>
              <ul className="mt-3 divide-y divide-slate-100">
                {closedProposals.map((proposal) => (
                  <li
                    key={proposal.id}
                    className="flex items-center justify-between gap-3 py-3 text-xs"
                  >
                    <span>
                      <span className="block font-semibold text-slate-800">
                        {proposal.taskTitle}
                      </span>
                      <span className="text-slate-500">
                        {proposal.status.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </span>
                    <Link
                      href={`/messages?conversation=${encodeURIComponent(proposal.conversationId)}`}
                      className="font-semibold text-indigo-700 hover:underline"
                    >
                      View context
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : (
        <section className="space-y-4" aria-label="Accepted work">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              Delivery floor
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              Accepted work
            </h2>
          </div>

          {confirmedWithoutExecution.map((proposal) => (
            <article
              key={proposal.id}
              className="overflow-hidden rounded-2xl border border-emerald-200 bg-[linear-gradient(120deg,#ecfdf5_0%,#ffffff_65%)] p-5 sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <BadgeCheck className="h-4 w-4" /> Mutual commitment confirmed
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    {proposal.taskTitle}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    The client is completing payment authorization. Your capacity is reserved, but
                    work should not start until an active work room appears.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 sm:border-l sm:border-emerald-200 sm:pl-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Committed</p>
                    <p className="flex items-center gap-1 text-base font-bold text-slate-950">
                      <CircleDollarSign className="h-4 w-4 text-emerald-700" />
                      {formatMinorMoney(proposal.amount)}
                    </p>
                  </div>
                  <Link
                    href={`/messages?conversation=${encodeURIComponent(proposal.conversationId)}`}
                    className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-800 text-white"
                    aria-label={`Open context for ${proposal.taskTitle}`}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {works.length === 0 && confirmedWithoutExecution.length === 0 ? (
            <div className="workpay-card mx-auto max-w-2xl p-8 text-center sm:p-10">
              <Briefcase
                className="mx-auto mb-3 h-8 w-8 text-[var(--wp-accent)]"
                aria-hidden="true"
              />
              <h3 className="text-xl font-semibold tracking-tight text-[var(--wp-text-primary)]">
                No accepted work yet
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--wp-text-secondary)]">
                Work moves here only after you accept exact terms and the client confirms you.
              </p>
            </div>
          ) : null}

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
                      <div className="text-base font-bold text-[var(--charcoal)]">
                        {info.moneyStr}
                      </div>
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
        </section>
      )}
    </div>
  );
}
