"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  Receipt,
  FileCheck2,
  Lock,
} from "lucide-react";
import { formatMinorMoney } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { listPayments, listTasks } from "@/lib/api/endpoints";
import type { TaskDto, PaymentDto } from "@/lib/api/types";
import { ErrorState } from "@/components/states";
import { PageHeader } from "@/components/layout/page-header";

export default function PaymentsPage() {
  const {
    data: paymentsData,
    error: paymentsError,
    loading: paymentsLoading,
    reload: reloadPayments,
  } = useApi(() => listPayments(), [], "payments");
  const {
    data: tasksData,
    error: tasksError,
    reload: reloadTasks,
  } = useApi(() => listTasks(), [], "tasks");

  const payments: PaymentDto[] = paymentsData ?? [];
  const tasks: TaskDto[] = tasksData ?? [];

  const [filter, setFilter] = useState<"ALL" | "HELD" | "CAPTURED">("ALL");

  const taskMap = useMemo(() => {
    const map = new Map<string, TaskDto>();
    for (const t of tasks) {
      map.set(t.id, t);
    }
    return map;
  }, [tasks]);

  const summary = useMemo(() => {
    let heldMinor = 0;
    let capturedMinor = 0;

    for (const p of payments) {
      if (p.status === "CAPTURED") {
        capturedMinor += p.amountMinor;
      } else if (
        p.status === "AUTHORIZED" ||
        p.status === "PENDING" ||
        p.status === "AUTHORIZATION_REQUESTED"
      ) {
        heldMinor += p.amountMinor;
      }
    }

    return {
      heldStr: formatMinorMoney({ amountMinor: heldMinor, currency: "USD" }),
      capturedStr: formatMinorMoney({ amountMinor: capturedMinor, currency: "USD" }),
      totalCount: payments.length,
    };
  }, [payments]);

  const filteredPayments = useMemo(() => {
    if (filter === "HELD") {
      return payments.filter(
        (p) =>
          p.status === "AUTHORIZED" ||
          p.status === "PENDING" ||
          p.status === "AUTHORIZATION_REQUESTED",
      );
    }
    if (filter === "CAPTURED") {
      return payments.filter((p) => p.status === "CAPTURED");
    }
    return payments;
  }, [payments, filter]);

  const header = (
    <PageHeader
      eyebrow="Records"
      title="Payment simulation"
      description="Inspect policy-validation records for agreed amounts and simulated authorization or capture paths. No entry represents money charged, held, captured, or paid."
      actions={
        <Link
          href="/intake"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--wp-accent)] px-4 text-sm font-semibold text-white transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2"
        >
          + New task
        </Link>
      }
    />
  );

  if (paymentsError) {
    return (
      <div className="space-y-6 pb-12">
        {header}
        <ErrorState
          title="Payment simulation records could not be loaded"
          description={paymentsError.message}
          onRetry={reloadPayments}
        />
      </div>
    );
  }

  if (paymentsLoading && payments.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        {header}
        <div
          className="workpay-card p-8 text-center text-sm text-[var(--wp-text-secondary)]"
          role="status"
        >
          Loading simulation records…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {header}
      {tasksError ? (
        <ErrorState
          title="Task details are unavailable"
          description="Simulation records are shown below, but task titles may be incomplete."
          onRetry={reloadTasks}
        />
      ) : null}

      {/* 2. Authorization & Settlement Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="workpay-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Simulated authorizations</span>
            <Lock className="h-4 w-4 text-[var(--amber)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {summary.heldStr}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Policy states awaiting completion evidence. No funds are on hold.
          </p>
        </div>

        <div className="workpay-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Simulated captures</span>
            <CheckCircle2 className="h-4 w-4 text-[var(--green)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {summary.capturedStr}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Capture paths accepted by policy. No professional was paid.
          </p>
        </div>

        <div className="workpay-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Payment records</span>
            <Receipt className="h-4 w-4 text-[var(--blue)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {summary.totalCount}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Simulation records attached to tasks.
          </p>
        </div>
      </div>

      {/* 3. Filter tabs */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-sm font-medium"
        role="group"
        aria-label="Filter payment simulation records"
      >
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          aria-pressed={filter === "ALL"}
          className={`min-h-10 rounded-lg px-3 py-1.5 transition-colors ${
            filter === "ALL"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          All records ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("HELD")}
          aria-pressed={filter === "HELD"}
          className={`min-h-10 rounded-lg px-3 py-1.5 transition-colors ${
            filter === "HELD"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          Simulated authorizations
        </button>
        <button
          type="button"
          onClick={() => setFilter("CAPTURED")}
          aria-pressed={filter === "CAPTURED"}
          className={`min-h-10 rounded-lg px-3 py-1.5 transition-colors ${
            filter === "CAPTURED"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          Simulated captures
        </button>
      </div>

      {/* 4. Voucher Receipt Ticket Grid (Reference: Screenshot from 2026-10-23 06-10-05.png) */}
      {filteredPayments.length === 0 ? (
        <div className="workpay-card p-12 text-center">
          <Receipt className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-3" />
          <h2 className="text-base font-semibold text-[var(--charcoal)]">
            No simulation records match this filter
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Records appear only when a policy simulation has been started for a task.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredPayments.map((p) => {
            const task = taskMap.get(p.taskId);
            const title = task?.title || "Work Agreement Contract";
            const isCaptured = p.status === "CAPTURED";
            const isRefunded = p.status === "REFUNDED" || p.status === "VOIDED";

            const amountStr = formatMinorMoney({
              amountMinor: p.amountMinor,
              currency: p.currency,
            });

            const timeSource = p.capturedAt || p.authorizedAt;
            const dateStr = timeSource
              ? new Date(timeSource).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Not recorded";

            let badgeBg = "bg-amber-100 text-amber-800";
            let badgeText = "Simulated authorization";
            if (isCaptured) {
              badgeBg = "bg-emerald-100 text-emerald-800";
              badgeText = "Simulated capture";
            } else if (isRefunded) {
              badgeBg = "bg-gray-100 text-gray-700";
              badgeText = "Simulation voided";
            }

            return (
              <div key={p.id} className="receipt-ticket flex flex-col justify-between">
                {/* Upper Half: Voucher Header & Economic Scope */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      REF-{p.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${badgeBg}`}
                    >
                      {badgeText}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold tracking-tight text-[var(--charcoal)] mt-3">
                    {title}
                  </h3>

                  <div className="mt-4 flex items-baseline justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Agreed Amount
                      </div>
                      <div className="text-2xl font-bold tracking-tight text-[var(--charcoal)]">
                        {amountStr}{" "}
                        <span className="text-xs font-normal text-[var(--text-muted)]">
                          {p.currency}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Environment
                      </div>
                      <div className="text-xs font-medium text-[var(--charcoal)]">
                        Validation only
                      </div>
                    </div>
                  </div>
                </div>

                {/* Perforated Tear Divider (Notches + Dashed Line) */}
                <div className="receipt-divider">
                  <div className="receipt-notch-left" />
                  <div className="receipt-line" />
                  <div className="receipt-notch-right" />
                </div>

                {/* Lower Half: Verification Proof & Settlement References */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[var(--text-muted)] block">Simulation reference:</span>
                      <span className="font-mono font-medium text-[var(--charcoal)] truncate block">
                        {p.paypalAuthorizationId || "Not available"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block">
                        {isCaptured ? "Simulation completed:" : "Simulation state recorded:"}
                      </span>
                      <span className="font-medium text-[var(--charcoal)] block">{dateStr}</span>
                    </div>
                  </div>

                  {p.latestDecision && (
                    <div className="p-2.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-[var(--charcoal)]">
                        <FileCheck2 className="h-3.5 w-3.5 text-[var(--green)]" />
                        <span>
                          Policy Check: {p.latestDecision.action} ({p.latestDecision.result})
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {p.latestDecision.reason}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {isCaptured
                        ? "Policy simulation recorded capture"
                        : "No funds are held or moved"}
                    </span>

                    <Link
                      href={`/tasks/${p.taskId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--charcoal)] hover:text-black hover:underline"
                    >
                      <span>Task workspace</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
