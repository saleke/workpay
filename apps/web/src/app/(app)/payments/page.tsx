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

export default function PaymentsPage() {
  const { data: paymentsData, loading: paymentsLoading } = useApi(
    () => listPayments(),
    [],
    "payments",
  );
  const { data: tasksData } = useApi(() => listTasks(), [], "tasks");

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
      } else if (p.status === "AUTHORIZED" || p.status === "PENDING" || p.status === "AUTHORIZATION_REQUESTED") {
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
        (p) => p.status === "AUTHORIZED" || p.status === "PENDING" || p.status === "AUTHORIZATION_REQUESTED",
      );
    }
    if (filter === "CAPTURED") {
      return payments.filter((p) => p.status === "CAPTURED");
    }
    return payments;
  }, [payments, filter]);

  if (paymentsLoading && payments.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-[var(--text-muted)]">
        Opening payment ledger...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header with clear non-custodial notice */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
            PayPal Settlement Ledger
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
            Immutable record of PayPal authorization holds and cryptographically verified captures. WorkPay does not operate a wallet; funds remain held externally on PayPal until deliverables pass verifiable checks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/tasks/new"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-[var(--charcoal)] text-white hover:bg-black px-3.5 py-2 rounded-lg transition-colors"
          >
            <span>+ New task</span>
          </Link>
        </div>
      </div>

      {/* 2. Authorization & Settlement Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="workpay-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>PayPal Authorization Holds</span>
            <Lock className="h-4 w-4 text-[var(--amber)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {summary.heldStr}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Authorized with PayPal. Awaiting completed deliverables and cryptographic verification.
          </p>
        </div>

        <div className="workpay-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Captured on Verified Proof</span>
            <CheckCircle2 className="h-4 w-4 text-[var(--green)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {summary.capturedStr}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Released to specialists following policy validation and verified proof.
          </p>
        </div>

        <div className="workpay-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Total Agreements</span>
            <Receipt className="h-4 w-4 text-[var(--blue)]" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-[var(--charcoal)]">
            {summary.totalCount}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Authoritative payment records attached to tasks.
          </p>
        </div>
      </div>

      {/* 3. Filter tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 text-sm font-medium">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
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
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === "HELD"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          Authorized Holds
        </button>
        <button
          type="button"
          onClick={() => setFilter("CAPTURED")}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filter === "CAPTURED"
              ? "bg-[var(--surface-subtle)] text-[var(--charcoal)] font-semibold"
              : "text-[var(--text-muted)] hover:text-[var(--charcoal)]"
          }`}
        >
          Captured & Settled
        </button>
      </div>

      {/* 4. Voucher Receipt Ticket Grid (Reference: Screenshot from 2026-10-23 06-10-05.png) */}
      {filteredPayments.length === 0 ? (
        <div className="workpay-card p-12 text-center">
          <Receipt className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-3" />
          <h2 className="text-base font-semibold text-[var(--charcoal)]">
            No payment receipts match this filter
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            When you sign a contract, an external PayPal authorization ticket appears here.
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
              : "Recent";

            let badgeBg = "bg-amber-100 text-amber-800";
            let badgeText = "PayPal Authorization Hold";
            if (isCaptured) {
              badgeBg = "bg-emerald-100 text-emerald-800";
              badgeText = "Captured on Verified Proof";
            } else if (isRefunded) {
              badgeBg = "bg-gray-100 text-gray-700";
              badgeText = "Voided to Task Owner";
            }

            return (
              <div key={p.id} className="receipt-ticket flex flex-col justify-between">
                {/* Upper Half: Voucher Header & Economic Scope */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      REF-{p.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${badgeBg}`}>
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
                        Specialist Destination
                      </div>
                      <div className="text-xs font-medium text-[var(--charcoal)]">
                        {p.payoutEmail || "Assigned specialist"}
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
                      <span className="text-[var(--text-muted)] block">PayPal Auth ID:</span>
                      <span className="font-mono font-medium text-[var(--charcoal)] truncate block">
                        {p.paypalAuthorizationId || "AUTH-EXT-SIMULATED"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block">
                        {isCaptured ? "Captured Timestamp:" : "Authorized Timestamp:"}
                      </span>
                      <span className="font-medium text-[var(--charcoal)] block">{dateStr}</span>
                    </div>
                  </div>

                  {p.latestDecision && (
                    <div className="p-2.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-[var(--charcoal)]">
                        <FileCheck2 className="h-3.5 w-3.5 text-[var(--green)]" />
                        <span>Policy Check: {p.latestDecision.action} ({p.latestDecision.result})</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {p.latestDecision.reason}
                      </p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {isCaptured
                        ? "Settlement confirmed via PayPal"
                        : "Held until 100% criteria proven"}
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
