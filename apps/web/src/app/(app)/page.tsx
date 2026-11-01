"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listTasks, listActivity, listPayments } from "@/lib/api/endpoints";
import type { TaskDto, ActivityEntryDto, PaymentDto } from "@/lib/api/types";

export default function HomeDashboardPage() {
  const [userName, setUserName] = useState("Alice");

  useEffect(() => {
    try {
      const storedAuth = window.localStorage.getItem("workpay_auth_user");
      if (storedAuth) {
        const parsed = JSON.parse(storedAuth);
        if (parsed?.name) {
          setUserName(parsed.name);
          return;
        }
      }
      const storedPersona = window.localStorage.getItem("workpay_persona");
      if (storedPersona === "provider") setUserName("Bob");
      else if (storedPersona === "admin_reviewer") setUserName("Carol");
      else setUserName("Alice");
    } catch {
      // fallback
    }
  }, []);

  // Load data with SWR cache
  const { data: tasksData, loading: tasksLoading } = useApi(() => listTasks(), [], "tasks");
  const { data: activityData } = useApi(() => listActivity(), [], "activity");
  const { data: paymentsData } = useApi(() => listPayments(), [], "payments");

  const tasks: TaskDto[] = tasksData ?? [];
  const activities: ActivityEntryDto[] = activityData ?? [];
  const payments: PaymentDto[] = paymentsData ?? [];

  // Derive Attention Queue: tasks requiring immediate action
  const attentionTasks = useMemo(() => {
    return tasks.filter((t) => {
      return (
        t.status === "CONTRACT_REVIEW" ||
        t.status === "HUMAN_REVIEW" ||
        t.status === "REVISION_REQUIRED" ||
        t.status === "AWAITING_CLARIFICATION" ||
        t.status === "AGREEMENT_READY"
      );
    });
  }, [tasks]);

  // Derive Active Tasks (excluding completed/settled/cancelled)
  const activeTasks = useMemo(() => {
    return tasks.filter(
      (t) => t.status !== "COMPLETED" && t.status !== "PAYMENT_RELEASE" && t.status !== "CANCELLED",
    );
  }, [tasks]);

  // Commitment Summary (real data, PayPal escrow semantics, never a wallet balance)
  const commitments = useMemo(() => {
    let heldMinor = 0;
    let settledMinor = 0;

    for (const p of payments) {
      if (p.status === "CAPTURED") {
        settledMinor += p.amountMinor;
      } else if (
        p.status === "AUTHORIZED" ||
        p.status === "PENDING" ||
        p.status === "AUTHORIZATION_REQUESTED"
      ) {
        heldMinor += p.amountMinor;
      }
    }

    return {
      held: formatMinorMoney({ amountMinor: heldMinor, currency: "USD" }),
      settled: formatMinorMoney({ amountMinor: settledMinor, currency: "USD" }),
      activeCount: activeTasks.length,
    };
  }, [payments, activeTasks]);

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Top Greeting and Concise System Summary (Section 5) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
            Good day, {userName}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {activeTasks.length === 0
              ? "All active work agreements are settled. Ready for your next objective."
              : `${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"} in flight. ${
                  attentionTasks.length > 0
                    ? `${attentionTasks.length} require${attentionTasks.length === 1 ? "s" : ""} your review.`
                    : "All milestones running smoothly."
                }`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[var(--text-muted)] hover:text-[var(--charcoal)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>View all tasks</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 2. Commitment Summary Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="workpay-card p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Simulated authorization</span>
            <ShieldCheck className="h-4 w-4 text-[var(--amber)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {commitments.held}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Agreement amounts currently exercising the payment-policy path. No funds are held.
          </p>
        </div>

        <div className="workpay-card p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Simulated captures</span>
            <CheckCircle2 className="h-4 w-4 text-[var(--green)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {commitments.settled}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Capture paths accepted by policy during validation. No professional was paid.
          </p>
        </div>

        <div className="workpay-card p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Active Commitments</span>
            <Clock className="h-4 w-4 text-[var(--blue)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {commitments.activeCount}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Tasks currently in planning, provider matching, execution, or verification.
          </p>
        </div>
      </div>

      {/* 3. Primary task-intake entry point */}
      <section className="workpay-card p-6 sm:p-7 border-[var(--border-strong)] relative overflow-hidden bg-white">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--amber)] mb-2">
          <span>Task intake</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--charcoal)]">
          Start with the outcome you need
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
          Tell WorkPay what you want to accomplish in your own words. You will confirm the
          understanding, answer only important scope questions, and set a budget before approving a
          brief.
        </p>

        <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-5 text-[var(--text-muted)]">
            Your request stays a draft until you review and approve it. This intake will not select
            or contact a professional.
          </p>
          <Link
            href="/intake"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--charcoal)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-black"
          >
            Start task intake
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* 4. Attention Queue (Urgent Actions - Section 5) */}
      {attentionTasks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--amber)] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Requires Your Attention ({attentionTasks.length})</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {attentionTasks.map((task) => {
              const isContractReview =
                task.status === "CONTRACT_REVIEW" || task.status === "AGREEMENT_READY";
              const isHumanReview = task.status === "HUMAN_REVIEW";
              const isRevision = task.status === "REVISION_REQUIRED";

              const badgeText = isContractReview
                ? "Contract Awaiting Sign-off"
                : isHumanReview
                  ? "Verification Uncertain"
                  : isRevision
                    ? "Revision Requested"
                    : "Action Needed";

              const actionLabel = isContractReview
                ? "Review & Sign Contract"
                : isHumanReview
                  ? "Inspect Evidence & Decide"
                  : "View Revision Progress";

              return (
                <div
                  key={task.id}
                  className="workpay-card p-5 border-amber-200 bg-amber-50/30 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {badgeText}
                      </span>
                      <span className="text-xs font-mono text-[var(--text-muted)]">
                        {task.id.slice(0, 8)}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-[var(--charcoal)] mt-2">
                      {task.title}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                      {task.rawRequest}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-amber-100">
                    <div className="text-xs text-[var(--text-soft)]">
                      <span className="font-semibold text-[var(--charcoal)]">
                        {formatMinorMoney({
                          amountMinor: task.budgetMinor,
                          currency: task.currency,
                        })}
                      </span>{" "}
                      authorized on PayPal
                    </div>

                    <Link
                      href={`/tasks/${task.id}`}
                      className="inline-flex items-center gap-1 bg-[var(--charcoal)] text-white hover:bg-black px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      <span>{actionLabel}</span>
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Active Tasks Grid (Section 5) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--charcoal)]">
            Active Tasks
          </h2>
          <Link
            href="/tasks"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--charcoal)] font-medium flex items-center gap-1"
          >
            <span>All tasks ({tasks.length})</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {tasksLoading && tasks.length === 0 ? (
          <div className="workpay-card p-8 text-center text-sm text-[var(--text-muted)]">
            Loading active tasks...
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="workpay-card p-8 text-center text-sm text-[var(--text-muted)]">
            No tasks currently in flight. Describe a new objective above to begin.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTasks.slice(0, 6).map((task) => {
              const amountStr = formatMinorMoney({
                amountMinor: task.budgetMinor,
                currency: task.currency,
              });

              let statusBg = "bg-blue-50 text-blue-700";
              let statusLabel = "In Execution";

              if (task.status === "CONTRACT_REVIEW" || task.status === "AGREEMENT_READY") {
                statusBg = "bg-amber-50 text-amber-800";
                statusLabel = "Awaiting Approval";
              } else if (task.status === "SUBMITTED" || task.status === "VERIFYING") {
                statusBg = "bg-purple-50 text-purple-700";
                statusLabel = "Verifying Proof";
              } else if (task.status === "PLANNING" || task.status === "CREATED") {
                statusBg = "bg-gray-100 text-gray-700";
                statusLabel = "Synthesizing";
              }

              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="workpay-card p-5 hover:border-[var(--charcoal)] transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBg}`}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-xs font-semibold text-[var(--charcoal)]">
                        {amountStr}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-[var(--charcoal)] mt-3 group-hover:text-[var(--blue)] transition-colors line-clamp-2">
                      {task.title}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="font-mono">{task.id.slice(0, 8)}</span>
                    <span className="flex items-center gap-1 group-hover:text-[var(--charcoal)] font-medium">
                      <span>View workspace</span>
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Recent Activity & Audit Timeline (Section 5 & 13) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--charcoal)]">
            Recent Activity
          </h2>
          <Link
            href="/activity"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--charcoal)] font-medium flex items-center gap-1"
          >
            <span>Full audit log</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="workpay-card divide-y divide-[var(--border-subtle)]">
          {activities.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--text-muted)]">
              No recent events recorded.
            </div>
          ) : (
            activities.slice(0, 5).map((act) => {
              const timeStr = new Date(act.occurredAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <div
                  key={act.id}
                  className="p-4 flex items-baseline justify-between gap-4 text-xs sm:text-sm"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="h-2 w-2 rounded-full bg-[var(--amber)] shrink-0 self-center" />
                    <div>
                      <span className="font-medium text-[var(--charcoal)]">{act.title}</span>
                      {act.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{act.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs text-[var(--text-muted)]">
                    <span>{timeStr}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
