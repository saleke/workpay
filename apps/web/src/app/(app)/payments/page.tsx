"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listPayments, listTasks } from "@/lib/api/endpoints";
import type { TaskDto } from "@/lib/api/types";

export default function PaymentsPage() {
  const { data: paymentsData, loading: paymentsLoading } = useApi(
    () => listPayments(),
    [],
    "payments",
  );
  const { data: tasksData } = useApi(() => listTasks(), [], "tasks");

  const payments = paymentsData ?? [];
  const tasks = tasksData ?? [];

  const taskMap = useMemo(() => {
    const map = new Map<string, TaskDto>();
    for (const t of tasks) {
      map.set(t.id, t);
    }
    return map;
  }, [tasks]);

  if (paymentsLoading && payments.length === 0) {
    return (
      <div className="py-20 text-center text-[var(--room-muted)] font-serif">
        Opening payments register...
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          No payment records yet
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          When you sign a contract, funds are held securely until every requirement is met.
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
      <p className="screen-label">Payments</p>
      <div className="sheet">
        <div
          className="register-row heads"
          style={{ paddingTop: 0, borderBottom: "var(--rule) solid var(--ink)" }}
        >
          <span className="lbl">Contract</span>
          <span className="lbl">Money</span>
          <span className="lbl">State</span>
        </div>

        {payments.map((p) => {
          const task = taskMap.get(p.taskId);
          const title = task?.title || "Work contract";
          const isPaid = p.status === "CAPTURED";
          const isRefunded = p.status === "REFUNDED" || p.status === "VOIDED";

          const stateWord = isPaid ? "Paid" : isRefunded ? "Refunded" : "Payment held";
          const moneyWord = isPaid ? "paid" : isRefunded ? "refunded" : "held";
          const stateClass = isPaid
            ? "note-met"
            : isRefunded
              ? "text-[var(--ink-muted)]"
              : "note-unsure";

          const amountStr = formatMinorMoney({
            amountMinor: p.amountMinor,
            currency: p.currency,
          });

          const timeSource = p.capturedAt || p.authorizedAt;
          const dateStr = timeSource
            ? new Date(timeSource).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "Recent";

          const refText = p.paypalAuthorizationId
            ? `PayPal authorization ${p.paypalAuthorizationId.slice(-8)}, ${dateStr}`
            : `Transaction ${p.id.slice(0, 8)}, ${dateStr}`;

          const noteText = isPaid
            ? "Payment released upon verified proof."
            : isRefunded
              ? "Payment returned to source account."
              : "Funds held securely until proof is met.";

          return (
            <div key={p.id} className="register-row">
              <div>
                <div className="row-title">
                  <Link href={`/tasks/${p.taskId}`} className="hover:underline">
                    {title}
                  </Link>
                </div>
                <div className="lbl">{refText}</div>
                <div className="note text-[var(--ink-muted)]">{noteText}</div>
              </div>

              <div className="money amount">
                {amountStr} <span className="lbl">{moneyWord}</span>
              </div>

              <div className="state">
                <span className={`state-label ${stateClass}`}>{stateWord}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
