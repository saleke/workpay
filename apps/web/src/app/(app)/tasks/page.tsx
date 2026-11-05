"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listTasks } from "@/lib/api/endpoints";
import type { TaskDto } from "@/lib/api/types";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/states";

export default function TasksPage() {
  const { data, error, loading, reload } = useApi(() => listTasks(), [], "tasks");
  const tasks = data ?? [];

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "ATTENTION" | "IN_PROGRESS" | "COMPLETED">(
    "ALL",
  );

  const filteredTasks = useMemo(() => {
    let list = tasks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.rawRequest.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      );
    }

    if (filterTab === "ATTENTION") {
      list = list.filter(
        (t) =>
          t.status === "CONTRACT_REVIEW" ||
          t.status === "HUMAN_REVIEW" ||
          t.status === "REVISION_REQUIRED" ||
          t.status === "AWAITING_CLARIFICATION" ||
          t.status === "AGREEMENT_READY",
      );
    } else if (filterTab === "IN_PROGRESS") {
      list = list.filter(
        (t) =>
          t.status !== "COMPLETED" &&
          t.status !== "PAYMENT_RELEASE" &&
          t.status !== "CANCELLED" &&
          t.status !== "CONTRACT_REVIEW" &&
          t.status !== "HUMAN_REVIEW" &&
          t.status !== "REVISION_REQUIRED",
      );
    } else if (filterTab === "COMPLETED") {
      list = list.filter((t) => t.status === "COMPLETED" || t.status === "PAYMENT_RELEASE");
    }

    return list;
  }, [tasks, searchQuery, filterTab]);

  const attentionCount = useMemo(() => {
    return tasks.filter(
      (t) =>
        t.status === "CONTRACT_REVIEW" ||
        t.status === "HUMAN_REVIEW" ||
        t.status === "REVISION_REQUIRED" ||
        t.status === "AWAITING_CLARIFICATION" ||
        t.status === "AGREEMENT_READY",
    ).length;
  }, [tasks]);

  if (error && tasks.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Workspace"
          title="Tasks"
          description="Your requests and their current stage."
        />
        <ErrorState
          title="Tasks could not be loaded"
          description={error.message}
          onRetry={reload}
        />
      </div>
    );
  }

  if (loading && tasks.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Workspace"
          title="Tasks"
          description="Your requests and their current stage."
        />
        <div
          className="workpay-card p-8 text-center text-sm text-[var(--wp-text-secondary)]"
          role="status"
        >
          Loading tasks…
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          eyebrow="Workspace"
          title="Tasks"
          description="Your requests and their current stage."
        />
        <div className="workpay-card mx-auto max-w-2xl p-8 text-center sm:p-10">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-[var(--wp-accent)]" aria-hidden="true" />
          <h2 className="text-xl font-semibold tracking-tight text-[var(--wp-text-primary)]">
            No tasks yet
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--wp-text-secondary)]">
            Start with the outcome you need. WorkPay helps you confirm the brief and budget before
            you choose a professional or approve any next step.
          </p>
          <Link
            href="/intake"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--wp-accent)] px-4 text-sm font-semibold text-white transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create a task
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Workspace"
        title="Tasks"
        description="Follow each request from its approved scope through discussion, delivery, review, and payment-policy testing."
        actions={
          <Link
            href="/intake"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--wp-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--wp-accent)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New task
          </Link>
        }
      />

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs font-medium sm:text-sm"
          role="group"
          aria-label="Filter tasks"
        >
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            aria-pressed={filterTab === "ALL"}
            className={`min-h-10 rounded-xl px-3 py-2 transition-colors ${
              filterTab === "ALL"
                ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            All tasks ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ATTENTION")}
            aria-pressed={filterTab === "ATTENTION"}
            className={`flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 transition-colors ${
              filterTab === "ATTENTION"
                ? "bg-amber-100 text-amber-900 font-semibold border border-amber-300"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            <span>Needs Attention</span>
            {attentionCount > 0 && (
              <span className="h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {attentionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("IN_PROGRESS")}
            aria-pressed={filterTab === "IN_PROGRESS"}
            className={`min-h-10 rounded-xl px-3 py-2 transition-colors ${
              filterTab === "IN_PROGRESS"
                ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("COMPLETED")}
            aria-pressed={filterTab === "COMPLETED"}
            className={`min-h-10 rounded-xl px-3 py-2 transition-colors ${
              filterTab === "COMPLETED"
                ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold border border-[var(--border-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
            }`}
          >
            Finished
          </button>
        </div>

        {/* Search Input */}
        <div className="relative sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search tasks"
            placeholder="Search tasks..."
            className="min-h-10 w-full rounded-lg border border-[var(--wp-border)] bg-white py-2 pl-9 pr-3 text-xs text-[var(--wp-text-primary)] placeholder:text-[var(--wp-text-muted)] transition-all focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] sm:text-sm"
          />
        </div>
      </div>

      {/* 3. Task Cards List */}
      {filteredTasks.length === 0 ? (
        <div className="workpay-card p-12 text-center text-sm text-[var(--text-muted)]">
          No tasks found matching your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === "COMPLETED" || task.status === "PAYMENT_RELEASE";
            const isAttention =
              task.status === "CONTRACT_REVIEW" ||
              task.status === "HUMAN_REVIEW" ||
              task.status === "REVISION_REQUIRED" ||
              task.status === "AWAITING_CLARIFICATION" ||
              task.status === "AGREEMENT_READY";

            const moneyStr = formatMinorMoney({
              amountMinor: task.budgetMinor,
              currency: task.currency,
            });
            const nextAction =
              task.status === "AWAITING_CLARIFICATION"
                ? "Answer the open question"
                : task.status === "CONTRACT_REVIEW" || task.status === "AGREEMENT_READY"
                  ? "Review and approve the scope"
                  : task.status === "APPROVED" || task.status === "PROVIDER_SEARCH"
                    ? "Review professionals and choose who to contact"
                    : task.status === "NEGOTIATION"
                      ? "Open the task to follow contact discussions"
                      : task.status === "PAYMENT_AUTHORIZATION"
                        ? "Review payment simulation status"
                        : task.status === "WORK_IN_PROGRESS"
                          ? "Track the assigned work"
                          : task.status === "SUBMITTED" || task.status === "VERIFYING"
                            ? "Review delivery checks"
                            : task.status === "REVISION_REQUIRED"
                              ? "Review the requested revision"
                              : task.status === "HUMAN_REVIEW"
                                ? "Choose an independent reviewer"
                                : task.status === "PAYMENT_RELEASE"
                                  ? "Review completion status"
                                  : task.status === "COMPLETED"
                                    ? "Review completed task"
                                    : task.status === "CANCELLED" || task.status === "EXPIRED"
                                      ? "View task history"
                                      : "Continue task setup";

            let statusBadge = "bg-blue-50 text-blue-700";
            let statusLabel = "In Execution";

            switch (task.status) {
              case "DRAFT":
                statusBadge = "bg-stone-100 text-stone-700";
                statusLabel = "Draft";
                break;
              case "CREATED":
              case "PLANNING":
                statusBadge = "bg-blue-50 text-blue-700";
                statusLabel = "Drafting Specification";
                break;
              case "AWAITING_CLARIFICATION":
                statusBadge = "bg-amber-100 text-amber-800";
                statusLabel = "Clarification Needed";
                break;
              case "CONTRACT_REVIEW":
                statusBadge = "bg-amber-100 text-amber-800";
                statusLabel = "Scope needs approval";
                break;
              case "APPROVED":
              case "PROVIDER_SEARCH":
                statusBadge = "bg-indigo-50 text-indigo-700";
                statusLabel = "Choose a professional";
                break;
              case "NEGOTIATION":
                statusBadge = "bg-indigo-50 text-indigo-700";
                statusLabel = "Contact discussion";
                break;
              case "AGREEMENT_READY":
                statusBadge = "bg-amber-50 text-amber-700";
                statusLabel = "Terms ready for payment simulation";
                break;
              case "PAYMENT_AUTHORIZATION":
                statusBadge = "bg-amber-50 text-amber-700";
                statusLabel = "Payment simulation pending";
                break;
              case "WORK_IN_PROGRESS":
                statusBadge = "bg-blue-50 text-blue-700";
                statusLabel = "In Execution";
                break;
              case "SUBMITTED":
              case "VERIFYING":
                statusBadge = "bg-purple-50 text-purple-700";
                statusLabel = "Verifying Proof";
                break;
              case "REVISION_REQUIRED":
                statusBadge = "bg-rose-50 text-rose-700";
                statusLabel = "Revision Requested";
                break;
              case "HUMAN_REVIEW":
                statusBadge = "bg-amber-100 text-amber-800";
                statusLabel = "Independent Review Needed";
                break;
              case "PAYMENT_RELEASE":
              case "COMPLETED":
                statusBadge = "bg-emerald-50 text-emerald-700";
                statusLabel = "Completed";
                break;
              case "CANCELLED":
              case "EXPIRED":
                statusBadge = "bg-gray-100 text-gray-600";
                statusLabel = "Closed";
                break;
              case "DISPUTED":
                statusBadge = "bg-rose-100 text-rose-800";
                statusLabel = "Disputed";
                break;
            }

            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className={`workpay-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[var(--charcoal)] transition-all group ${
                  isAttention ? "border-amber-200 bg-amber-50/20" : ""
                }`}
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusBadge}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-[var(--charcoal)] group-hover:text-[var(--blue)] transition-colors">
                    {task.title}
                  </h3>

                  <p className="text-xs text-[var(--text-muted)] line-clamp-1 max-w-2xl">
                    {task.rawRequest}
                  </p>
                  <p className="pt-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                    Next: {nextAction}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 shrink-0">
                  <div className="text-right">
                    <div className="text-base font-bold text-[var(--charcoal)]">{moneyStr}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {isCompleted ? "Task budget ceiling" : "Buyer budget ceiling"}
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
      )}
    </div>
  );
}
