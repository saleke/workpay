"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listTasks } from "@/lib/api/endpoints";
import type { TaskDto } from "@/lib/api/types";

function formatDueOrCompleted(task: TaskDto, isPaid: boolean): string {
  if (isPaid && task.completedAt) {
    try {
      const d = new Date(task.completedAt);
      return `paid ${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
    } catch {
      return "paid recently";
    }
  }

  if (task.desiredDeadline) {
    try {
      const due = new Date(task.desiredDeadline);
      const now = new Date();
      const diffMs = due.getTime() - now.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));

      if (diffHours > 0 && diffHours < 24) {
        return `due in ${diffHours} hour${diffHours === 1 ? "" : "s"}`;
      }
      if (diffHours >= 24 && diffHours < 48) {
        return "due tomorrow";
      }
      return `due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    } catch {
      return "due soon";
    }
  }

  return "in progress";
}

function getTaskDetails(task: TaskDto) {
  const isPaid = task.status === "COMPLETED" || task.status === "PAYMENT_RELEASE";
  const dueOrPaid = formatDueOrCompleted(task, isPaid);
  const providerDisplay = task.plannerSource || "Assigned specialist";
  const metaLine = `${providerDisplay}, ${dueOrPaid}`;

  let group: "attention" | "in_progress" | "completed" = "in_progress";
  let stateLabel = "Work in progress";
  let noteClass = "";
  let situationNote = "Work in progress.";

  if (task.status === "HUMAN_REVIEW") {
    group = "attention";
    stateLabel = "Review needed";
    noteClass = "note-unsure";
    situationNote = "Verification could not decide one or more requirements. Review needed.";
  } else if (task.status === "REVISION_REQUIRED") {
    group = "attention";
    stateLabel = "Revision requested";
    noteClass = "note-fail";
    situationNote = "One or more requirements were not met. Revision requested from provider.";
  } else if (task.status === "CONTRACT_REVIEW") {
    group = "attention";
    stateLabel = "Signing needed";
    noteClass = "note-unsure";
    situationNote = "WorkPay drafted the requirements. Awaiting your signature.";
  } else if (task.status === "DISPUTED") {
    group = "attention";
    stateLabel = "Review needed";
    noteClass = "note-fail";
    situationNote = "Contract is in arbitration.";
  } else if (isPaid) {
    group = "completed";
    stateLabel = "Paid";
    noteClass = "note-met";
    situationNote = "Every requirement met.";
  } else if (task.status === "CANCELLED") {
    group = "completed";
    stateLabel = "Cancelled";
    noteClass = "text-[var(--ink-muted)]";
    situationNote = "Contract was cancelled.";
  } else if (task.status === "VERIFYING") {
    group = "in_progress";
    stateLabel = "Verifying";
    noteClass = "note-unsure";
    situationNote = "Deliverables submitted. Checking requirements.";
  } else if (task.status === "SUBMITTED") {
    group = "in_progress";
    stateLabel = "Submitted";
    noteClass = "note-unsure";
    situationNote = "Work submitted by provider.";
  } else if (task.status === "PROVIDER_SEARCH" || task.status === "NEGOTIATION") {
    group = "in_progress";
    stateLabel = "Finding provider";
    noteClass = "text-[var(--ink-muted)]";
    situationNote = "WorkPay is finding and negotiating with providers within your limit.";
  } else if (task.status === "PLANNING" || task.status === "CREATED") {
    group = "in_progress";
    stateLabel = "Drafting";
    noteClass = "text-[var(--ink-muted)]";
    situationNote = "Drafting requirements and contract terms.";
  } else {
    group = "in_progress";
    stateLabel = "Work in progress";
    noteClass = "text-[var(--ink-muted)]";
    situationNote = "No work has been submitted yet.";
  }

  return {
    group,
    stateLabel,
    noteClass,
    situationNote,
    isPaid,
    metaLine,
  };
}

export default function TasksPage() {
  const { data, loading } = useApi(() => listTasks(), [], "tasks");
  const tasks = data ?? [];

  const { attentionTasks, inProgressTasks, completedTasks } = useMemo(() => {
    const attention: TaskDto[] = [];
    const inProgress: TaskDto[] = [];
    const completed: TaskDto[] = [];

    for (const task of tasks) {
      const { group } = getTaskDetails(task);
      if (group === "attention") attention.push(task);
      else if (group === "completed") completed.push(task);
      else inProgress.push(task);
    }

    return {
      attentionTasks: attention,
      inProgressTasks: inProgress,
      completedTasks: completed,
    };
  }, [tasks]);

  if (loading && tasks.length === 0) {
    return (
      <div className="py-16 text-center text-[var(--room-muted)] font-serif">
        Opening the register...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          Give WorkPay something to do
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          Describe what you need done. WorkPay turns it into a contract, finds a verified provider, and protects your payment.
        </p>
        <div className="mt-6">
          <Link href="/tasks/new" className="btn btn-room">
            New task
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="screen-label">Tasks</p>
      <div className="sheet">
        <div
          className="register-row heads"
          style={{ paddingTop: 0, borderBottom: "var(--rule) solid var(--ink)" }}
        >
          <span className="lbl">Contract</span>
          <span className="lbl">Money</span>
          <span className="lbl">State</span>
        </div>

        {attentionTasks.length > 0 && (
          <>
            <p className="group-heading" style={{ marginTop: "var(--space-3)" }}>
              Needs your attention
            </p>
            {attentionTasks.map((task) => {
              const info = getTaskDetails(task);
              const moneyStr = formatMinorMoney({
                amountMinor: task.budgetMinor,
                currency: task.currency,
              });

              return (
                <div key={task.id} className="register-row">
                  <div>
                    <div className="row-title">
                      <Link href={`/tasks/${task.id}`} className="hover:underline">
                        {task.title}
                      </Link>
                    </div>
                    <div className="lbl">{info.metaLine}</div>
                    <div className={`note ${info.noteClass}`}>{info.situationNote}</div>
                  </div>
                  <div className="money amount">
                    {moneyStr} <span className="lbl">{info.isPaid ? "paid" : "held"}</span>
                  </div>
                  <div className="state">
                    <span className={`state-label ${info.noteClass}`}>{info.stateLabel}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {inProgressTasks.length > 0 && (
          <>
            <p className="group-heading">In progress</p>
            {inProgressTasks.map((task) => {
              const info = getTaskDetails(task);
              const moneyStr = formatMinorMoney({
                amountMinor: task.budgetMinor,
                currency: task.currency,
              });

              return (
                <div key={task.id} className="register-row">
                  <div>
                    <div className="row-title">
                      <Link href={`/tasks/${task.id}`} className="hover:underline">
                        {task.title}
                      </Link>
                    </div>
                    <div className="lbl">{info.metaLine}</div>
                    <div className={`note ${info.noteClass}`}>{info.situationNote}</div>
                  </div>
                  <div className="money amount">
                    {moneyStr} <span className="lbl">{info.isPaid ? "paid" : "held"}</span>
                  </div>
                  <div className="state">
                    <span className={`state-label ${info.noteClass}`}>{info.stateLabel}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {completedTasks.length > 0 && (
          <>
            <p className="group-heading">Completed</p>
            {completedTasks.map((task) => {
              const info = getTaskDetails(task);
              const moneyStr = formatMinorMoney({
                amountMinor: task.budgetMinor,
                currency: task.currency,
              });

              return (
                <div key={task.id} className="register-row">
                  <div>
                    <div className="row-title">
                      <Link href={`/tasks/${task.id}`} className="hover:underline">
                        {task.title}
                      </Link>
                    </div>
                    <div className="lbl">{info.metaLine}</div>
                    <div className={`note ${info.noteClass}`}>{info.situationNote}</div>
                  </div>
                  <div className="money amount">
                    {moneyStr} <span className="lbl">{info.isPaid ? "paid" : "held"}</span>
                  </div>
                  <div className="state">
                    <span className={`state-label ${info.noteClass}`}>{info.stateLabel}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
